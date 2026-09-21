/*
 * The interactive review loop.
 *
 * One pass over every pending submission, oldest first (SubmissionStore.list's
 * own order — see store.json.ts). For each: print it, ask approve / reject /
 * skip / quit. Approving walks through the fields review/propose.ts has no
 * source for, proposing a default and accepting Enter or a typed
 * replacement, then shows the complete record before anything is written and
 * asks write / edit a field / cancel — only "write" hands it to
 * review/approve.ts, which is where the actual write-ordering decisions
 * live. This file is only prompting, validating and formatting.
 */

import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import { ROLES, USE_CASES, WORKFLOW_STAGES, type RoleName, type WorkflowStage } from '../catalogue/taxonomy.ts'
import type { Container } from '../container.ts'
import type { Submission } from '../submissions/types.ts'
import { approveSubmission } from './approve.ts'
import { buildTool, type ReviewedFields } from './buildTool.ts'
import { resolveListInput, splitList } from './listInput.ts'
import { proposeMono, proposePrice, proposeRoles, proposeSummary, proposeTags, PROPOSED_POP } from './propose.ts'
import type { Ask } from './prompt.ts'
import { slugify, uniqueSlug } from './slug.ts'

export interface RunReviewOptions {
  dryRun: boolean
}

/** Every slug currently in the catalogue, paginating past the page-size cap. */
async function allSlugs(catalogue: ToolCatalogueRepository): Promise<Set<string>> {
  const slugs = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const page = await catalogue.search({ status: 'all', limit: 100, cursor })
    for (const tool of page.items) slugs.add(tool.slug)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return slugs
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function printSubmission(submission: Submission): void {
  console.log('')
  console.log(`=== ${submission.name} — ${submission.siteUrl} ===`)
  console.log(`id: ${submission.id}   submitted: ${submission.createdAt}`)
  console.log(`category: ${submission.category}   pricing: ${submission.pricingModel}   plan: ${submission.plan}`)
  console.log(`tagline: ${submission.tagline}`)
  console.log(`description: ${submission.description}`)
  if (submission.audience) console.log(`audience: ${submission.audience}`)
  if (submission.tags.length > 0) console.log(`tags: ${submission.tags.join(', ')}`)
  if (submission.faqs.length > 0) console.log(`faqs: ${submission.faqs.length}`)
}

/** One free-text field: shows the proposal, Enter accepts it, anything else replaces it. */
export async function promptField(ask: Ask, label: string, proposed: string): Promise<string> {
  const answer = (await ask(`${label} [${proposed}]: `)).trim()
  return answer === '' ? proposed : answer
}

/**
 * A comma-separated list field restricted to `allowed` values, matched
 * case-insensitively but stored with `allowed`'s own casing — typing
 * "student" resolves to "Student". The allowed-values list is printed once,
 * before the loop; a retry after invalid input shows only the error and a
 * short re-prompt, not the list again.
 */
export async function promptClosedListField<T extends string>(
  ask: Ask,
  label: string,
  proposed: readonly T[],
  allowed: readonly T[],
): Promise<T[]> {
  console.log(`${label} — choose one or more from: ${allowed.join(', ')}`)
  let defaultShown = proposed

  for (;;) {
    const raw = await ask(`${label} (comma-separated) [${defaultShown.join(', ') || '(none proposed)'}]: `)
    const typed = raw.trim() === '' ? defaultShown : splitList(raw)

    if (typed.length === 0) {
      console.log('  At least one value is required.')
      defaultShown = []
      continue
    }

    const { resolved, invalid } = resolveListInput(typed, allowed)
    if (invalid.length > 0) {
      console.log(`  Not in the allowed list: ${invalid.join(', ')}`)
      defaultShown = resolved
      continue
    }
    return resolved
  }
}

/** A comma-separated free-text list field — no closed vocabulary, still ≥1 required. */
export async function promptOpenListField(ask: Ask, label: string, proposed: readonly string[]): Promise<string[]> {
  for (;;) {
    const raw = await ask(`${label} (comma-separated) [${proposed.join(', ') || '(none proposed)'}]: `)
    const values = raw.trim() === '' ? [...proposed] : splitList(raw)
    if (values.length > 0) return values
    console.log('  At least one value is required.')
  }
}

async function collectFields(
  ask: Ask,
  submission: Submission,
  catalogue: ToolCatalogueRepository,
): Promise<ReviewedFields> {
  const existingSlugs = await allSlugs(catalogue)
  const proposedSlug = uniqueSlug(slugify(submission.name), existingSlugs)

  const mono = await promptField(ask, 'mono', proposeMono(submission.name))
  const price = await promptField(ask, 'price', proposePrice(submission.price))
  const popText = await promptField(ask, 'pop (0-100)', String(PROPOSED_POP))
  const pop = Number.parseInt(popText, 10)

  const roles = await promptClosedListField<RoleName>(ask, 'roles', proposeRoles(submission.audience), ROLES)
  const stages = await promptClosedListField<WorkflowStage>(ask, 'stages', [], WORKFLOW_STAGES)
  // useCases has a fixed vocabulary too (USE_CASES, taxonomy.ts) — the
  // catalogue schema checks membership in it directly (schema.ts's
  // superRefine, not a z.enum, but still closed) — so this is exactly
  // roles/stages's case, not the free-text case the review decisions
  // otherwise call for.
  const useCases = await promptClosedListField<string>(ask, 'useCases', [], USE_CASES)
  const tags = await promptOpenListField(ask, 'tags', proposeTags(submission.tags, submission.category))
  const summary = await promptField(ask, 'summary', proposeSummary(submission.description))
  const slug = await promptField(ask, 'slug', proposedSlug)

  return { mono, price, pop, roles, stages, useCases, tags, summary, slug }
}

type FieldName = 'mono' | 'price' | 'pop' | 'roles' | 'stages' | 'usecases' | 'tags' | 'summary' | 'slug'

const EDITABLE_FIELDS: readonly FieldName[] = [
  'mono',
  'price',
  'pop',
  'roles',
  'stages',
  'usecases',
  'tags',
  'summary',
  'slug',
]

/** Re-prompts exactly one field, defaulting to its CURRENT value (not the original proposal), and returns the updated fields. */
async function editField(ask: Ask, name: FieldName, fields: ReviewedFields): Promise<ReviewedFields> {
  switch (name) {
    case 'mono':
      return { ...fields, mono: await promptField(ask, 'mono', fields.mono) }
    case 'price':
      return { ...fields, price: await promptField(ask, 'price', fields.price) }
    case 'pop': {
      const popText = await promptField(ask, 'pop (0-100)', String(fields.pop))
      return { ...fields, pop: Number.parseInt(popText, 10) }
    }
    case 'roles':
      return { ...fields, roles: await promptClosedListField<RoleName>(ask, 'roles', fields.roles, ROLES) }
    case 'stages':
      return { ...fields, stages: await promptClosedListField<WorkflowStage>(ask, 'stages', fields.stages, WORKFLOW_STAGES) }
    case 'usecases':
      return { ...fields, useCases: await promptClosedListField<string>(ask, 'useCases', fields.useCases, USE_CASES) }
    case 'tags':
      return { ...fields, tags: await promptOpenListField(ask, 'tags', fields.tags) }
    case 'summary':
      return { ...fields, summary: await promptField(ask, 'summary', fields.summary) }
    case 'slug':
      return { ...fields, slug: await promptField(ask, 'slug', fields.slug) }
  }
}

export type ConfirmOutcome = { action: 'write'; fields: ReviewedFields } | { action: 'cancel' }

/**
 * Shows the complete record `fields` would produce and asks write / edit a
 * field / cancel — the gate SPEC decision #5 puts before any write. "edit"
 * loops back into a single field's prompt and shows the record again;
 * "cancel" returns without ever calling approveSubmission.
 */
export async function confirmTool(
  ask: Ask,
  submission: Submission,
  initialFields: ReviewedFields,
  today: string,
): Promise<ConfirmOutcome> {
  let fields = initialFields

  for (;;) {
    console.log('')
    console.log('Proposed catalogue record:')
    console.log(JSON.stringify(buildTool(submission, fields, today), null, 2))

    const action = (await ask('[w]rite / [e]dit a field / [c]ancel: ')).trim().toLowerCase()

    if (action === 'w' || action === 'write') return { action: 'write', fields }
    if (action === 'c' || action === 'cancel') return { action: 'cancel' }
    if (action === 'e' || action === 'edit') {
      const typed = (await ask(`Field to edit (${EDITABLE_FIELDS.join(', ')}): `)).trim().toLowerCase()
      if (!(EDITABLE_FIELDS as readonly string[]).includes(typed)) {
        console.log(`  Not a field: "${typed}".`)
        continue
      }
      fields = await editField(ask, typed as FieldName, fields)
      continue
    }
    console.log(`Not understood: "${action}".`)
  }
}

export async function runReview(container: Container, options: RunReviewOptions, ask: Ask): Promise<void> {
  const { catalogue, submissionStore } = container
  const pending = await submissionStore.list({ status: 'pending' })

  if (pending.length === 0) {
    console.log('No pending submissions.')
    return
  }

  let approvedCount = 0

  for (const submission of pending) {
    printSubmission(submission)
    const action = (await ask('[a]pprove / [r]eject / [s]kip / [q]uit: ')).trim().toLowerCase()

    if (action === 'q' || action === 'quit') break
    if (action === 'r' || action === 'reject') {
      const note = (await ask('Rejection note (optional): ')).trim()
      await submissionStore.updateStatus(submission.id, 'rejected', note === '' ? undefined : note)
      console.log('Rejected.')
      continue
    }
    if (action !== 'a' && action !== 'approve') {
      console.log(action === 's' || action === 'skip' ? 'Skipped.' : `Not understood: "${action}" — skipped.`)
      continue
    }

    const today = todayIso()
    let initialFields: ReviewedFields
    try {
      initialFields = await collectFields(ask, submission, catalogue)
    } catch (error) {
      console.log(`Could not collect fields: ${(error as Error).message}. Skipped.`)
      continue
    }

    const outcome = await confirmTool(ask, submission, initialFields, today)
    if (outcome.action === 'cancel') {
      console.log('Cancelled — nothing written, submission left pending.')
      continue
    }

    try {
      const result = await approveSubmission({
        submission,
        fields: outcome.fields,
        catalogue,
        store: submissionStore,
        today,
        dryRun: options.dryRun,
      })

      if (options.dryRun) {
        console.log('--dry-run: would write —')
        console.log(JSON.stringify(result.tool, null, 2))
        console.log(result.created ? '(new catalogue record)' : '(catalogue already has this URL; would only mark approved)')
      } else {
        console.log(
          result.created
            ? `Approved as "${result.tool.slug}" — added to the catalogue.`
            : `Approved — the catalogue already had "${result.tool.slug}" for this URL; marked approved without duplicating it.`,
        )
        approvedCount++
      }
    } catch (error) {
      console.log(`Could not approve: ${(error as Error).message}`)
    }
  }

  if (approvedCount > 0) {
    console.log('')
    console.log(`${approvedCount} tool(s) written to the catalogue. Restart the server to serve them.`)
  }
}
