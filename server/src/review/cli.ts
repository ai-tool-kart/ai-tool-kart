/*
 * The interactive review loop.
 *
 * One pass over every pending submission, oldest first (SubmissionStore.list's
 * own order — see store.json.ts). For each: print it, ask approve / reject /
 * skip / quit. Approving walks through the fields review/propose.ts has no
 * source for, proposing a default and accepting Enter or a typed
 * replacement, then hands everything to review/approve.ts, which is where
 * the actual write-ordering decisions live — this file is only prompting
 * and formatting.
 */

import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import { ROLES, USE_CASES, WORKFLOW_STAGES, type RoleName, type WorkflowStage } from '../catalogue/taxonomy.ts'
import type { Container } from '../container.ts'
import type { Submission } from '../submissions/types.ts'
import { approveSubmission } from './approve.ts'
import type { ReviewedFields } from './buildTool.ts'
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
async function promptField(ask: Ask, label: string, proposed: string): Promise<string> {
  const answer = (await ask(`${label} [${proposed}]: `)).trim()
  return answer === '' ? proposed : answer
}

/**
 * A comma-separated list field restricted to `allowed` values. Re-prompts on
 * an empty result or an entry outside `allowed`, naming exactly which.
 */
async function promptClosedListField<T extends string>(
  ask: Ask,
  label: string,
  proposed: readonly T[],
  allowed: readonly T[],
): Promise<T[]> {
  const allowedSet = new Set<string>(allowed)
  let defaultShown = proposed
  for (;;) {
    const raw = await ask(
      `${label} — from: ${allowed.join(', ')}\n  [${defaultShown.join(', ') || '(none proposed)'}]: `,
    )
    const values = (raw.trim() === '' ? defaultShown : raw.split(',').map((v) => v.trim()).filter((v) => v !== '')) as T[]

    if (values.length === 0) {
      console.log('  At least one value is required.')
      defaultShown = []
      continue
    }
    const invalid = values.filter((value) => !allowedSet.has(value))
    if (invalid.length > 0) {
      console.log(`  Not in the allowed list: ${invalid.join(', ')}`)
      defaultShown = values.filter((value) => allowedSet.has(value))
      continue
    }
    return values
  }
}

/** A comma-separated free-text list field — no closed vocabulary, still ≥1 required. */
async function promptOpenListField(ask: Ask, label: string, proposed: readonly string[]): Promise<string[]> {
  for (;;) {
    const raw = await ask(`${label} [${proposed.join(', ') || '(none proposed)'}]: `)
    const values = raw.trim() === '' ? [...proposed] : raw.split(',').map((v) => v.trim()).filter((v) => v !== '')
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
  const useCases = await promptOpenListField(ask, 'useCases', [])
  const tags = await promptOpenListField(ask, 'tags', proposeTags(submission.tags, submission.category))
  const summary = await promptField(ask, 'summary', proposeSummary(submission.description))
  const slug = await promptField(ask, 'slug', proposedSlug)

  return { mono, price, pop, roles, stages, useCases, tags, summary, slug }
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

    let fields: ReviewedFields
    try {
      fields = await collectFields(ask, submission, catalogue)
    } catch (error) {
      console.log(`Could not collect fields: ${(error as Error).message}. Skipped.`)
      continue
    }

    try {
      const result = await approveSubmission({
        submission,
        fields,
        catalogue,
        store: submissionStore,
        today: todayIso(),
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
