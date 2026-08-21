/*
 * Weighted relevance scoring (NEWS_AGENT.md §11).
 *
 * Two of the four dimensions are computed here with no model involvement at all
 * (freshness, sourceTrust); the other two come from the classifier. The pipeline
 * then decides — the model's `recommendation` is advisory, and never the thing
 * that puts an article on the blog.
 */

import {
  CORROBORATION_BONUS,
  FRESHNESS_HALF_LIFE_HOURS,
  MAX_CORROBORATION_BONUS,
  MIN_IMPORTANCE,
  MIN_RELEVANCE,
  SCORE_WEIGHTS,
  TIER_TRUST_SCORE,
} from '../config/limits.ts'
import type { StoryScores, TrustTier } from '../domain/types.ts'

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(10, value))
}

/**
 * Freshness decays linearly from 10 to 0 across the window.
 *
 * Linear rather than exponential on purpose: an exponential curve makes
 * anything over a day old indistinguishable from anything over a week old, and
 * this pipeline runs every few hours, not every few minutes.
 */
export function freshnessScore(ageHours: number): number {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 0
  const decayed = 10 * (1 - ageHours / (FRESHNESS_HALF_LIFE_HOURS * 2))
  return clampScore(decayed)
}

/**
 * Trust from the best available tier plus bounded corroboration.
 *
 * Corroboration is capped so that ten outlets rewriting one press release
 * cannot outrank a single primary source, which is the whole point of the tier
 * system (§5).
 */
export function sourceTrustScore(tiers: TrustTier[], independentPublishers: number): number {
  if (tiers.length === 0) return 0
  const bestTier = Math.min(...tiers) as TrustTier
  const base = TIER_TRUST_SCORE[bestTier]
  const corroboration = Math.min(
    Math.max(independentPublishers - 1, 0) * CORROBORATION_BONUS,
    MAX_CORROBORATION_BONUS,
  )
  return clampScore(base + corroboration)
}

export interface ScoreInput {
  /** From the classifier, 0-10. */
  relevance: number
  /** From the classifier, 0-10. */
  importance: number
  /** Hours since the freshest item. */
  ageHours: number
  tiers: TrustTier[]
  independentPublishers: number
  /** Deterministic topic prior from the prefilter. */
  topicAdjustment: number
}

export function computeScores(input: ScoreInput): StoryScores {
  const relevance = clampScore(input.relevance)
  const importance = clampScore(input.importance)
  const freshness = freshnessScore(input.ageHours)
  const sourceTrust = sourceTrustScore(input.tiers, input.independentPublishers)

  const weightedBase =
    SCORE_WEIGHTS.relevance * relevance +
    SCORE_WEIGHTS.importance * importance +
    SCORE_WEIGHTS.sourceTrust * sourceTrust +
    SCORE_WEIGHTS.freshness * freshness

  /*
   * The topic prior adjusts rather than dominates: it is capped at +/-2 points so
   * a keyword list can promote a borderline story or damp a suspicious one, but
   * cannot on its own carry something the classifier judged irrelevant.
   */
  const adjustment = Math.max(-2, Math.min(2, input.topicAdjustment * 0.4))

  return {
    relevance,
    importance,
    freshness,
    sourceTrust,
    weighted: clampScore(weightedBase + adjustment),
  }
}

export interface SelectionInput {
  weighted: number
  /** Classifier relevance, checked against a hard floor of its own. */
  relevance: number
  /** Classifier importance, likewise. */
  importance: number
  hasTier1: boolean
  independentPublishers: number
  minWeightedScore: number
}

export interface SelectionVerdict {
  selected: boolean
  reason?: string
}

/**
 * The final gate before expensive work.
 *
 * A story must clear the score threshold AND have a credible evidence base: a
 * Tier 1 source, or at least two independent Tier 2 publishers. This is the §5
 * rule ("a Tier 3 signal that cannot be corroborated is a rumour") enforced
 * before the pipeline pays for evidence gathering rather than after.
 */
export function selectStory(input: SelectionInput): SelectionVerdict {
  /*
   * Relevance and importance floors are checked BEFORE the weighted score. A
   * Tier 1 source publishing something our readers do not care about is still
   * something our readers do not care about, and no amount of trust or freshness
   * should be able to buy it a place on the blog.
   */
  if (input.relevance < MIN_RELEVANCE) {
    return {
      selected: false,
      reason: `below-relevance-floor (${input.relevance.toFixed(1)} < ${MIN_RELEVANCE})`,
    }
  }
  if (input.importance < MIN_IMPORTANCE) {
    return {
      selected: false,
      reason: `below-importance-floor (${input.importance.toFixed(1)} < ${MIN_IMPORTANCE})`,
    }
  }
  if (input.weighted < input.minWeightedScore) {
    return {
      selected: false,
      reason: `below-threshold (${input.weighted.toFixed(2)} < ${input.minWeightedScore})`,
    }
  }
  if (!input.hasTier1 && input.independentPublishers < 2) {
    return { selected: false, reason: 'insufficient-source-base (no Tier 1, no corroboration)' }
  }
  return { selected: true }
}
