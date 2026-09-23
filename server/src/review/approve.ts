/*
 * The approve orchestration — SPEC decisions for the review script.
 *
 * Order: confirm the submission is still pending, THEN check the catalogue
 * for an existing record at the same normalized URL, THEN create only if
 * absent, THEN mark the submission approved. That specific order is what
 * makes a re-run after a partial failure converge instead of duplicating:
 * if a prior run's catalogue write succeeded but its status update did not
 * (crash, killed process, whatever), the submission is still 'pending' on
 * the next run, but findByNormalizedUrl now finds the tool this run already
 * wrote — so this run skips `create()` and only completes the status
 * update the last run never reached. Two runs, one catalogue entry.
 *
 * Separate from the interactive prompting in review/cli.ts on purpose: this
 * is the part with actual decisions to get right, and it needs to be
 * callable from a test with fixture collaborators, not just from a
 * terminal.
 */

import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import type { Tool } from '../domain/types.ts'
import type { SubmissionStore } from '../submissions/store.ts'
import type { Submission } from '../submissions/types.ts'
import { buildTool, type ReviewedFields } from './buildTool.ts'

export interface ApproveOptions {
  submission: Submission
  fields: ReviewedFields
  catalogue: ToolCatalogueRepository
  store: SubmissionStore
  /** ISO `YYYY-MM-DD`. See buildTool.ts for why this is passed in, not read from the clock. */
  today: string
  /** True: build and report the tool, touch neither the catalogue nor the store. */
  dryRun?: boolean
}

export interface ApproveResult {
  /** The record that is (or, under --dry-run, would be) in the catalogue — the existing one if this was a re-run, else the newly built one. */
  tool: Tool
  /** False when a matching catalogue record already existed — the idempotent-re-run case, not an error. */
  created: boolean
  /** The submission after the status update — or the original, unmodified, under --dry-run. */
  submission: Submission
  dryRun: boolean
}

export async function approveSubmission(options: ApproveOptions): Promise<ApproveResult> {
  const { submission, fields, catalogue, store, today, dryRun = false } = options

  if (submission.status !== 'pending') {
    throw new Error(`Submission "${submission.id}" is already "${submission.status}", not pending.`)
  }

  const built = buildTool(submission, fields, today)
  const existing = await catalogue.findByNormalizedUrl(submission.normalizedUrl)
  const wouldCreate = existing === undefined

  if (dryRun) {
    return { tool: existing ?? built, created: wouldCreate, submission, dryRun: true }
  }

  if (wouldCreate) await catalogue.create(built)
  const updated = await store.updateStatus(submission.id, 'approved')

  return { tool: existing ?? built, created: wouldCreate, submission: updated, dryRun: false }
}
