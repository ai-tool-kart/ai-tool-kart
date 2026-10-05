/*
 * What a submitter may see of their own submission — the one projection the
 * /me/submissions routes (list and detail) both return.
 *
 * An allowlist: reviewer_id, audit events, internal notes (a later phase)
 * and anything added to the table later stay server-side unless named here.
 * ownerMessage and rejectionReason ARE included: they are the review outcome
 * written for the submitter.
 */

import type { Submission } from '../generated/prisma/client.ts'

export interface OwnerSubmissionView {
  id: string
  status: Submission['status']
  revision: number
  toolId: string | null
  siteUrl: string
  name: string
  tagline: string
  category: string
  plan: Submission['plan']
  launchWeekId: string
  ownerMessage: string | null
  rejectionReason: string | null
  submittedAt: string
  reviewedAt: string | null
  publishedAt: string | null
  updatedAt: string
}

export function toOwnerSubmission(submission: Submission): OwnerSubmissionView {
  return {
    id: submission.id,
    status: submission.status,
    revision: submission.revision,
    toolId: submission.toolId,
    siteUrl: submission.siteUrl,
    name: submission.name,
    tagline: submission.tagline,
    category: submission.category,
    plan: submission.plan,
    launchWeekId: submission.launchWeekId,
    ownerMessage: submission.ownerMessage,
    rejectionReason: submission.rejectionReason,
    submittedAt: submission.submittedAt.toISOString(),
    reviewedAt: submission.reviewedAt?.toISOString() ?? null,
    publishedAt: submission.publishedAt?.toISOString() ?? null,
    updatedAt: submission.updatedAt.toISOString(),
  }
}
