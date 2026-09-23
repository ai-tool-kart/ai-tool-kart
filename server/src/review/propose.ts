/*
 * Field proposals for the review script — one pure function per field that
 * has no direct source on a Submission. Every one of these is a DEFAULT the
 * reviewer sees and can overwrite; none of them commit to anything by
 * themselves. See the review-script decisions this file implements.
 */

import { NOT_RECORDED, PRICING_MODELS_BY_TIER, PRICING_TIERS, PROMINENCE, ROLE_KEYWORDS } from '../catalogue/taxonomy.ts'
import type { PricingModel, PricingTier, RoleName } from '../catalogue/taxonomy.ts'

/** "Cl" for "Claude" — first letter uppercased, second lowercased, whatever it is. */
export function proposeMono(name: string): string {
  const trimmed = name.trim()
  const first = (trimmed[0] ?? 'x').toUpperCase()
  const second = (trimmed[1] ?? 'x').toLowerCase()
  return first + second
}

/** The submission's own price, or the catalogue's sentinel for "not recorded". */
export function proposePrice(price: string | undefined): string {
  const trimmed = price?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : NOT_RECORDED
}

/** A brand-new tool has no editorial prominence assessment yet — the lowest named band. */
export const PROPOSED_POP = PROMINENCE.niche

const SENTENCE_END = /[.!?](?=\s|$)/g

/**
 * `description`, truncated near `target` characters at a sentence boundary
 * where one exists close by, else at a word boundary, else a hard cut.
 * Never below the catalogue schema's 40-character floor when `description`
 * itself is long enough to allow it — a description shorter than that is
 * returned whole, letting the write-time validation (and the reviewer) catch
 * the case honestly rather than padding it here.
 */
const SENTENCE_BOUNDARY_TOLERANCE = 100

export function proposeSummary(description: string, target = 300): string {
  const trimmed = description.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= target) return trimmed

  // The sentence end CLOSEST to the target, either side of it, as long as
  // it's within tolerance — not just the last one that fits inside a
  // one-sided window, which would happily walk past the target sentence and
  // stop at the next one instead.
  let closest: number | undefined
  let closestDistance = Number.POSITIVE_INFINITY
  for (const match of trimmed.matchAll(SENTENCE_END)) {
    if (match.index === undefined) continue
    const position = match.index + 1
    if (position > target + SENTENCE_BOUNDARY_TOLERANCE) break
    const distance = Math.abs(position - target)
    if (distance < closestDistance) {
      closestDistance = distance
      closest = position
    }
  }
  if (closest !== undefined && closestDistance <= SENTENCE_BOUNDARY_TOLERANCE && closest >= 40) {
    return trimmed.slice(0, closest).trim()
  }

  // No sentence end close enough — cut at the last space at or before `target`.
  const hardCut = trimmed.slice(0, target)
  const lastSpace = hardCut.lastIndexOf(' ')
  const wordBoundaryCut = lastSpace >= 40 ? hardCut.slice(0, lastSpace) : hardCut
  return wordBoundaryCut.trim()
}

/**
 * Keyword-matches `audience`'s free text against ROLE_KEYWORDS. A heuristic,
 * not a guarantee — many audience strings won't match anything, which is why
 * the reviewer must still supply at least one role regardless of this
 * proposal (schema: `roles.min(1)`).
 */
export function proposeRoles(audience: string | undefined): RoleName[] {
  if (!audience) return []
  const haystack = audience.toLowerCase()
  const matches: RoleName[] = []
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS) as [RoleName, readonly string[]][]) {
    if (keywords.some((keyword) => haystack.includes(keyword))) matches.push(role)
  }
  return matches
}

/** The submission's own tags, or — if it listed none — its category as the one starting tag. */
export function proposeTags(tags: string[], category: string): string[] {
  return tags.length > 0 ? tags : [category]
}

/**
 * The one PricingTier `PRICING_MODELS_BY_TIER` (taxonomy.ts) legally pairs
 * with `model` — resolved, not proposed: SubmissionInputSchema already
 * restricted `pricingModel` to a member of PRICING_MODELS, so this mapping
 * is total and unambiguous, never a guess the reviewer needs to confirm.
 */
export function pricingTierFor(model: PricingModel): PricingTier {
  const tier = PRICING_TIERS.find((candidate) => PRICING_MODELS_BY_TIER[candidate].includes(model))
  if (!tier) throw new Error(`No pricing tier is configured for pricing model "${model}".`)
  return tier
}
