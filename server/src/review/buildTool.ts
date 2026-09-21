/*
 * Submission → Tool. Pure: every value either comes from the submission
 * directly, is one of the reviewer-confirmed fields, or is a fixed rule
 * settled by the review-script decisions below. No I/O, no Date.now() call
 * (the caller passes `today`), no randomness — the whole point is that this
 * is testable without a terminal attached.
 */

import { NOT_RECORDED } from '../catalogue/taxonomy.ts'
import type { PricingModel, RoleName, ToolCategoryName, WorkflowStage } from '../domain/types.ts'
import type { Tool } from '../domain/types.ts'
import { pricingTierFor } from './propose.ts'
import type { Submission } from '../submissions/types.ts'

/**
 * Everything the reviewer confirms or overrides for one approval — the
 * fields §1 of the review had no source for, after propose.ts's defaults
 * have been shown and accepted or replaced.
 */
export interface ReviewedFields {
  mono: string
  slug: string
  price: string
  pop: number
  roles: RoleName[]
  stages: WorkflowStage[]
  useCases: string[]
  tags: string[]
  summary: string
}

/**
 * `today` is an ISO `YYYY-MM-DD` string, not a `Date` — addedAt is meant to
 * record the day the tool was listed (taxonomy.ts's INTAKE comment: "when
 * tools are added through a real admin path, addedAt becomes a row's insert
 * timestamp"), and passing it in rather than reading the clock here is what
 * keeps this function pure.
 *
 * `submission.category`/`.pricingModel` are cast, not re-validated: both
 * were already checked against TOOL_CATEGORIES/PRICING_MODELS by
 * SubmissionInputSchema before this submission was ever stored (schema.ts),
 * so recovering the narrower type here is honest, not a bypass.
 */
export function buildTool(submission: Submission, fields: ReviewedFields, today: string): Tool {
  return {
    id: fields.slug,
    name: submission.name,
    mono: fields.mono,
    cat: submission.category as ToolCategoryName,
    model: submission.pricingModel as PricingModel,
    tagline: submission.tagline,
    rating: 0,
    reviews: 0,
    price: fields.price,
    trend: '',
    badge: '',
    tags: fields.tags,
    pop: fields.pop,
    api: NOT_RECORDED,
    ctx: NOT_RECORDED,
    team: NOT_RECORDED,
    trial: NOT_RECORDED,
    integr: NOT_RECORDED,
    slug: fields.slug,
    url: submission.siteUrl,
    summary: fields.summary,
    roles: fields.roles,
    useCases: fields.useCases,
    stages: fields.stages,
    pricingTier: pricingTierFor(submission.pricingModel as PricingModel),
    status: 'active',
    verified: false,
    addedAt: today,
  }
}
