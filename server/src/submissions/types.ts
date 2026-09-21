/*
 * The submission record — SPEC-submit-backend.md §4.
 *
 * `status`, `id`, `createdAt` and `normalizedUrl` are set server-side (by the
 * service layer and the store, not by the caller) and must be ignored if
 * present on an inbound request body — that stripping happens at the
 * validation boundary (schema.ts, a later slice), not here. This file only
 * declares the shapes.
 */

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface SubmissionFaq {
  question: string
  answer: string
}

export interface Submission {
  id: string
  status: SubmissionStatus
  createdAt: string // ISO 8601

  siteUrl: string // as submitted, trimmed
  normalizedUrl: string // see normalizeUrl.ts — what dupe checks compare
  name: string
  tagline: string
  description: string
  category: string
  pricingModel: string
  price?: string
  tags: string[]
  audience?: string
  alternatives: string[]
  faqs: SubmissionFaq[]
  launchStory?: string
  plan: 'free' | 'featured'
  launchWeekId: string // local-date string, see client/src/utils/launchWeeks.ts

  submittedFromIp?: string // for abuse review — see §9
}

/**
 * What a caller passes to `SubmissionStore.create()`: everything on a
 * `Submission` except the three fields the store itself assigns
 * (`id`, `status`, `createdAt`). `normalizedUrl` and `submittedFromIp` are
 * computed upstream of the store — by normalizeUrl.ts and the route,
 * respectively — and are already present by the time `create()` is called.
 */
export type NewSubmission = Omit<Submission, 'id' | 'status' | 'createdAt'>
