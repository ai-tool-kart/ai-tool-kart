/*
 * Article format selection.
 *
 * Answers one question before the writer runs: how much article does this
 * evidence actually support?
 *
 * The rule this module encodes is that LENGTH IS AN OUTPUT OF EVIDENCE, never a
 * target the writer works backwards from. A story with eight small facts from
 * one changelog gets a brief; a launch corroborated across three publishers with
 * twenty verified claims can earn an analysis. Neither is a degraded version of
 * the other.
 *
 * Deliberately deterministic, and deliberately not an LLM call. The model must
 * not be able to argue itself into a longer article — the format is computed
 * from counts the pipeline already verified, handed to the writer as a
 * constraint, and handed to the editor as the range to judge against.
 */

import {
  ARTICLE_FORMATS,
  DEFAULT_ARTICLE_FORMAT,
  FORMAT_THRESHOLDS,
  type ArticleFormat,
} from '../config/limits.ts'
import type { Claim, SourceEvidence } from '../domain/types.ts'

export interface FormatInput {
  claims: Claim[]
  evidence: SourceEvidence[]
  /** Classifier importance (0-10). Gates `analysis` only. */
  importance: number
}

export interface FormatDecision {
  format: ArticleFormat
  targetMinWords: number
  targetMaxWords: number
  /** Non-sensitive explanation, persisted and logged. */
  reason: string
  /** The counts the decision was made from, for the audit trail. */
  signals: {
    substantiveClaims: number
    singleSourceClaims: number
    evidenceSources: number
    tier1Sources: number
    independentPublishers: number
    importance: number
  }
}

function meets(
  threshold: (typeof FORMAT_THRESHOLDS)[keyof typeof FORMAT_THRESHOLDS],
  signals: FormatDecision['signals'],
): boolean {
  return (
    signals.substantiveClaims >= threshold.substantiveClaims &&
    signals.evidenceSources >= threshold.evidenceSources &&
    signals.independentPublishers >= threshold.independentPublishers &&
    signals.importance >= threshold.importance
  )
}

export function selectArticleFormat(input: FormatInput): FormatDecision {
  /*
   * Verified only. Single-source claims are counted and reported, but they do
   * not buy length — otherwise a pile of weakly-sourced assertions could unlock
   * an `analysis`, which is exactly backwards.
   */
  const substantiveClaims = input.claims.filter(
    (claim) => claim.supportLevel === 'verified',
  ).length
  const singleSourceClaims = input.claims.filter(
    (claim) => claim.supportLevel === 'single-source',
  ).length

  const evidenceSources = input.evidence.length
  const tier1Sources = input.evidence.filter((item) => item.trustTier === 1).length
  const independentPublishers = new Set(
    input.evidence.map((item) => item.publisher.trim().toLowerCase()).filter(Boolean),
  ).size

  const signals: FormatDecision['signals'] = {
    substantiveClaims,
    singleSourceClaims,
    evidenceSources,
    tier1Sources,
    independentPublishers,
    importance: input.importance,
  }

  let format: ArticleFormat = 'brief'
  let reason =
    `brief: ${substantiveClaims} verified claim(s) across ${evidenceSources} source(s) ` +
    'support a short, fully-grounded report rather than a longer one'

  if (meets(FORMAT_THRESHOLDS.standard, signals)) {
    format = 'standard'
    reason =
      `standard: ${substantiveClaims} verified claim(s) across ${evidenceSources} source(s) ` +
      `from ${independentPublishers} independent publisher(s)`
  }

  if (meets(FORMAT_THRESHOLDS.analysis, signals)) {
    format = 'analysis'
    reason =
      `analysis: ${substantiveClaims} verified claim(s) across ${evidenceSources} source(s) ` +
      `from ${independentPublishers} independent publisher(s), importance ${input.importance}`
  }

  const range = ARTICLE_FORMATS[format]
  return {
    format,
    targetMinWords: range.minWords,
    targetMaxWords: range.maxWords,
    reason,
    signals,
  }
}

/** The range a given format is judged against. Used by writer and editor alike. */
export function formatRange(format: ArticleFormat) {
  return ARTICLE_FORMATS[format] ?? ARTICLE_FORMATS[DEFAULT_ARTICLE_FORMAT]
}

/** Narrows a persisted string back to a format, tolerating pre-format rows. */
export function toArticleFormat(value: unknown): ArticleFormat {
  return typeof value === 'string' && value in ARTICLE_FORMATS
    ? (value as ArticleFormat)
    : DEFAULT_ARTICLE_FORMAT
}
