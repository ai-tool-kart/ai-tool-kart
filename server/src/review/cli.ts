/*
 * The interactive review loop.
 *
 * One pass over every pending submission, oldest first (SubmissionStore.list's
 * own order — see store.json.ts). For each: print it, ask approve / reject /
 * skip / quit. Approving walks through the fields review/propose.ts has no
 * source for, proposing a default and accepting Enter or a typed
 * replacement — validated against the catalogue schema's own limits
 * (review/validate.ts) as each one is entered, not only at write time — then
 * shows the complete record before anything is written and asks write / edit
 * a field / cancel — only "write" hands it to review/approve.ts, which is
 * where the actual write-ordering decisions live. This file is only
 * prompting, validating and formatting.
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
import { FIELD_RULES, validateMono, validatePopText, validatePrice, validateSlug, validateSummary, validateTag, type FieldValidator } from './validate.ts'
import { TOOL_FIELDS } from '../config/limits.ts'

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

/**
 * One free-text field: shows the proposal, Enter accepts it, anything else
 * replaces it. With `validate`, every candidate — the proposal included — is
 * checked before it can be accepted or offered as a default. A proposal that
 * fails is announced up front and NOT offered as an Enter-to-accept default;
 * the reviewer has to type a real value. A typed value that fails becomes
 * the new default so a small mistake (one character too long) can be
 * corrected without retyping the whole field.
 */
export async function promptField(
  ask: Ask,
  label: string,
  proposed: string,
  validate?: FieldValidator,
): Promise<string> {
  let current = proposed
  const proposalError = validate?.(current)
  if (proposalError) {
    console.log(`  Proposed ${label} is invalid — ${proposalError}`)
    current = ''
  }

  for (;;) {
    const promptText = current === '' ? `${label}: ` : `${label} [${current}]: `
    const answer = (await ask(promptText)).trim()
    const value = answer === '' ? current : answer

    if (value === '') {
      console.log('  A value is required.')
      continue
    }
    const error = validate?.(value)
    if (error) {
      console.log(`  ${error}`)
      current = value
      continue
    }
    return value
  }
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

export interface OpenListFieldOptions {
  minCount?: number
  maxCount?: number
  /** Checked against each individual value, e.g. a per-tag length cap. */
  validateItem?: FieldValidator
}

/** A comma-separated free-text list field — no closed vocabulary, but still bounded (count and, optionally, each item). */
export async function promptOpenListField(
  ask: Ask,
  label: string,
  proposed: readonly string[],
  options: OpenListFieldOptions = {},
): Promise<string[]> {
  const { minCount = 1, maxCount, validateItem } = options
  let defaultShown = proposed

  for (;;) {
    const raw = await ask(`${label} (comma-separated) [${defaultShown.join(', ') || '(none proposed)'}]: `)
    const values = raw.trim() === '' ? [...defaultShown] : splitList(raw)

    if (values.length < minCount) {
      console.log(`  At least ${minCount} value${minCount === 1 ? '' : 's'} required.`)
      defaultShown = values
      continue
    }
    if (maxCount !== undefined && values.length > maxCount) {
      console.log(`  At most ${maxCount} values allowed (got ${values.length}).`)
      defaultShown = values.slice(0, maxCount)
      continue
    }
    if (validateItem) {
      const errors = values.map((value) => validateItem(value)).filter((error): error is string => error !== undefined)
      if (errors.length > 0) {
        console.log(`  ${errors.join(' ')}`)
        defaultShown = values
        continue
      }
    }
    return values
  }
}

async function collectFields(
  ask: Ask,
  submission: Submission,
  catalogue: ToolCatalogueRepository,
): Promise<ReviewedFields> {
  const existingSlugs = await allSlugs(catalogue)
  const proposedSlug = uniqueSlug(slugify(submission.name), existingSlugs)

  const mono = await promptField(ask, `mono (${FIELD_RULES.mono})`, proposeMono(submission.name), validateMono)
  const price = await promptField(ask, `price (${FIELD_RULES.price})`, proposePrice(submission.price), validatePrice)
  const popText = await promptField(ask, `pop (${FIELD_RULES.pop})`, String(PROPOSED_POP), validatePopText)
  const pop = Number.parseInt(popText, 10)

  const roles = await promptClosedListField<RoleName>(ask, 'roles', proposeRoles(submission.audience), ROLES)
  const stages = await promptClosedListField<WorkflowStage>(ask, 'stages', [], WORKFLOW_STAGES)
  // useCases has a fixed vocabulary too (USE_CASES, taxonomy.ts) — the
  // catalogue schema checks membership in it directly (schema.ts's
  // superRefine, not a z.enum, but still closed) — so this is exactly
  // roles/stages's case, not the free-text case the review decisions
  // otherwise call for.
  const useCases = await promptClosedListField<string>(ask, 'useCases', [], USE_CASES)
  const tags = await promptOpenListField(ask, `tags (${FIELD_RULES.tags})`, proposeTags(submission.tags, submission.category), {
    minCount: TOOL_FIELDS.tagsMin,
    maxCount: TOOL_FIELDS.tagsMax,
    validateItem: validateTag,
  })
  const summary = await promptField(
    ask,
    `summary (${FIELD_RULES.summary})`,
    proposeSummary(submission.description),
    validateSummary,
  )
  const slug = await promptField(ask, `slug (${FIELD_RULES.slug})`, proposedSlug, validateSlug)

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
      return { ...fields, mono: await promptField(ask, `mono (${FIELD_RULES.mono})`, fields.mono, validateMono) }
    case 'price':
      return { ...fields, price: await promptField(ask, `price (${FIELD_RULES.price})`, fields.price, validatePrice) }
    case 'pop': {
      const popText = await promptField(ask, `pop (${FIELD_RULES.pop})`, String(fields.pop), validatePopText)
      return { ...fields, pop: Number.parseInt(popText, 10) }
    }
    case 'roles':
      return { ...fields, roles: await promptClosedListField<RoleName>(ask, 'roles', fields.roles, ROLES) }
    case 'stages':
      return { ...fields, stages: await promptClosedListField<WorkflowStage>(ask, 'stages', fields.stages, WORKFLOW_STAGES) }
    case 'usecases':
      return { ...fields, useCases: await promptClosedListField<string>(ask, 'useCases', fields.useCases, USE_CASES) }
    case 'tags':
      return {
        ...fields,
        tags: await promptOpenListField(ask, `tags (${FIELD_RULES.tags})`, fields.tags, {
          minCount: TOOL_FIELDS.tagsMin,
          maxCount: TOOL_FIELDS.tagsMax,
          validateItem: validateTag,
        }),
      }
    case 'summary':
      return {
        ...fields,
        summary: await promptField(ask, `summary (${FIELD_RULES.summary})`, fields.summary, validateSummary),
      }
    case 'slug':
      return { ...fields, slug: await promptField(ask, `slug (${FIELD_RULES.slug})`, fields.slug, validateSlug) }
  }
}

export type ConfirmOutcome = { action: 'write'; fields: ReviewedFields } | { action: 'cancel' }

/**
 * Shows the complete record `fields` would produce and asks write / edit a
 * field / cancel — the gate SPEC decision #5 puts before any write. "edit"
 * loops back into a single field's prompt and shows the record again;
 * "cancel" returns without ever calling approveSubmission.
 *
 * The per-field validation above catches the common case, but this is not
 * where the final guard lives — approveSubmission's own call into
 * catalogue.create() re-validates the WHOLE record through the same
 * parseCatalogue the server's loader runs, and refuses to write anything
 * that would fail. A hand-edited field can still only get caught there.
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
