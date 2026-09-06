/*
 * Deterministic relevance scoring.
 *
 * A pure function: same tool and same query, same score, forever. No clock, no
 * randomness, no I/O, no repository access. That purity is why
 * tests/retrieval.test.ts can assert exact rankings, and why a wrong
 * recommendation can be debugged by reading a number rather than by rerunning a
 * model (ASSISTANT_ARCHITECTURE_PLAN.md §9).
 *
 * Every weight lives in config/limits.ts as SCORE_WEIGHTS. None is written in
 * this file. Tuning relevance must never mean editing scoring logic — the day
 * the two are mixed, "why is this ranked here" stops being answerable from one
 * place.
 *
 * Every signal is normalised to 0–1 BEFORE it is weighted, so the weights are
 * directly comparable to each other and a breakdown reads honestly. A raw count
 * would let a long summary quietly outweigh an exact category match.
 */

import { SCORE_WEIGHTS, RETRIEVAL } from '../config/limits.ts'
import type { Tool } from '../domain/types.ts'
import type { NormalizedQuery } from './normalize.ts'
import { stem } from './normalize.ts'

/** Every weighted contribution, in the order they are applied. */
export interface ScoreSignals {
  nameExact: number
  nameToken: number
  category: number
  tagOverlap: number
  textOverlap: number
  role: number
  stage: number
  useCase: number
  popularity: number
  rating: number
  pricingMismatch: number
  verified: number
  confirmed: number
}

export interface ScoredTool {
  tool: Tool
  score: number
  /** The weighted contributions that produced `score`. Sums to it exactly. */
  signals: ScoreSignals
  /** Which inferred stages this tool covers. Drives stage coverage in select.ts. */
  matchedStages: string[]
}

const EMPTY_SIGNALS: ScoreSignals = {
  nameExact: 0,
  nameToken: 0,
  category: 0,
  tagOverlap: 0,
  textOverlap: 0,
  role: 0,
  stage: 0,
  useCase: 0,
  popularity: 0,
  rating: 0,
  pricingMismatch: 0,
  verified: 0,
  confirmed: 0,
}

/**
 * Per-tool lexical index, computed once per scoring pass.
 *
 * Building it inside scoreTool would restem every tag and every summary word for
 * every query. Hoisting it out keeps scoring a full catalogue linear in the
 * obvious way.
 */
export interface ToolIndex {
  name: string
  /** The name as a bounded regex, for whole-word matching inside a raw query. */
  namePattern: RegExp
  nameTerms: Set<string>
  tagTerms: Set<string>
  textTerms: Set<string>
  roles: Set<string>
  stages: Set<string>
  useCases: Set<string>
}

function termsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+.#]+/)
    .filter((token) => token.length >= RETRIEVAL.minTermLength)
    .map(stem)
}

/** Escapes a tool name for use inside a RegExp — "Copy.ai", "n8n", "v0". */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function indexTool(tool: Tool): ToolIndex {
  const name = tool.name.toLowerCase()
  return {
    name,
    // \b would not fire after a name ending in a non-word character ("Copy.ai"),
    // so the boundaries are asserted explicitly against start/end or a separator.
    namePattern: new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(name)}(?:$|[^a-z0-9])`),
    nameTerms: new Set(termsOf(tool.name)),
    tagTerms: new Set(tool.tags.flatMap(termsOf)),
    textTerms: new Set([
      ...termsOf(tool.name),
      ...termsOf(tool.tagline),
      ...termsOf(tool.summary),
      ...termsOf(tool.cat),
    ]),
    roles: new Set(tool.roles),
    stages: new Set(tool.stages),
    useCases: new Set(tool.useCases),
  }
}

/** Fraction of `terms` present in `set`. 0 when there are no terms to match. */
function coverage(terms: readonly string[], set: ReadonlySet<string>): number {
  if (terms.length === 0) return 0
  let hits = 0
  for (const term of terms) if (set.has(term)) hits += 1
  return hits / terms.length
}

export function scoreTool(tool: Tool, query: NormalizedQuery, index: ToolIndex): ScoredTool {
  const signals: ScoreSignals = { ...EMPTY_SIGNALS }

  /*
   * A rejected tool is not scored low, it is removed. -Infinity rather than a
   * large negative because "the user said no" is categorical: no amount of
   * relevance may bring it back, and no future weight change may accidentally
   * out-add the penalty.
   */
  if (query.rejectedToolIds.includes(tool.id)) {
    return { tool, score: Number.NEGATIVE_INFINITY, signals, matchedStages: [] }
  }

  /* ── Name ─────────────────────────────────────────────────────────────── */
  /*
   * Two conditions, and the second is the one that matters.
   *
   * A substring test alone gives full name credit to every tool whose name is an
   * ordinary English word: "make short clips from podcasts" scored Make — the
   * automation platform — at 3.0 and put it fifth, above half the video tools.
   * Requiring at least one name token to have SURVIVED stopword filtering fixes
   * the whole class, because those are exactly the words a query uses
   * incidentally. "make", "help" and "get" never reach query.terms; "descript",
   * "opus" and "clip" always do.
   */
  const namedExplicitly =
    index.namePattern.test(query.raw) &&
    [...index.nameTerms].some((term) => query.terms.includes(term))

  if (namedExplicitly) {
    signals.nameExact = SCORE_WEIGHTS.nameExact
  } else {
    const nameCoverage = coverage([...index.nameTerms], new Set(query.terms))
    signals.nameToken = SCORE_WEIGHTS.nameToken * nameCoverage
  }

  /* ── Facets ───────────────────────────────────────────────────────────── */
  if (query.categories.includes(tool.cat)) {
    signals.category = SCORE_WEIGHTS.category
  }

  signals.tagOverlap = SCORE_WEIGHTS.tagOverlap * coverage(query.terms, index.tagTerms)
  signals.textOverlap = SCORE_WEIGHTS.textOverlap * coverage(query.terms, index.textTerms)

  if (query.roles.some((role) => index.roles.has(role))) {
    signals.role = SCORE_WEIGHTS.role
  }

  const matchedStages = query.stages.filter((stage) => index.stages.has(stage))
  if (query.stages.length > 0) {
    signals.stage = SCORE_WEIGHTS.stage * (matchedStages.length / query.stages.length)
  }

  const useCaseHits = query.useCases.filter((useCase) => index.useCases.has(useCase)).length
  if (useCaseHits > 0) {
    signals.useCase =
      SCORE_WEIGHTS.useCase * Math.min(useCaseHits, RETRIEVAL.maxUseCaseMatches)
  }

  /* ── Quality priors ───────────────────────────────────────────────────── */
  signals.popularity = SCORE_WEIGHTS.popularity * (tool.pop / 100)
  // rating 0 means "unrated", not "bad". It contributes nothing rather than
  // dragging an unreviewed tool below a tool with one three-star review.
  signals.rating = tool.rating > 0 ? SCORE_WEIGHTS.rating * (tool.rating / 5) : 0
  signals.verified = tool.verified ? SCORE_WEIGHTS.verified : 0

  /* ── Constraints ──────────────────────────────────────────────────────── */
  if (query.pricingTiers.length > 0 && !query.pricingTiers.includes(tool.pricingTier)) {
    signals.pricingMismatch = SCORE_WEIGHTS.pricingMismatch
  }

  /*
   * A tool the user says they already use.
   *
   * Added to the signal list rather than applied as a filter or a re-sort: it
   * has to compete with relevance on the same scale as everything else, or
   * "I already use Claude" turns into "Claude is in every plan forever".
   */
  if (query.confirmedToolIds.includes(tool.id)) {
    signals.confirmed = SCORE_WEIGHTS.confirmed
  }

  const score = Object.values(signals).reduce((total, value) => total + value, 0)
  return { tool, score, signals, matchedStages }
}

/** Scores a whole set. Ordering is left to select.ts. */
export function scoreAll(tools: readonly Tool[], query: NormalizedQuery): ScoredTool[] {
  return tools.map((tool) => scoreTool(tool, query, indexTool(tool)))
}

/**
 * Whether the QUERY — rather than the tool's own standing — earned this score.
 *
 * popularity, rating and verified are priors: every active record collects them
 * whatever was asked. A tool that scores on those alone did not match anything,
 * it merely exists.
 *
 * The browse endpoint uses this to separate "66 tools, best match first" from
 * "5 tools actually match", which are very different things to show a user under
 * a search box. Assistant retrieval does NOT apply it — a candidate pool needs
 * breadth to staff a workflow stage.
 */
export function hasQuerySignal(scored: ScoredTool): boolean {
  const { nameExact, nameToken, category, tagOverlap, textOverlap, role, stage, useCase } =
    scored.signals
  return (
    nameExact > 0 ||
    nameToken > 0 ||
    category > 0 ||
    tagOverlap > 0 ||
    textOverlap > 0 ||
    role > 0 ||
    stage > 0 ||
    useCase > 0
  )
}

/** Human-readable breakdown for a test failure or a debug log. */
export function explainScore(scored: ScoredTool): string {
  const parts = Object.entries(scored.signals)
    .filter(([, value]) => value !== 0)
    .map(([name, value]) => `${name}=${value.toFixed(3)}`)
  return `${scored.tool.name} ${scored.score.toFixed(3)} [${parts.join(' ')}]`
}
