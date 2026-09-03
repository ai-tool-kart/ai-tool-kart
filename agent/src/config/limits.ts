/*
 * Ranking weights, verification rules, article constraints and retry budgets.
 *
 * These are the knobs the pipeline is expected to be tuned with. They live apart
 * from editorial topic lists (config/editorial.ts) because they change for
 * different reasons: topics change with the beat, these change with measured
 * pipeline behaviour.
 */

/** Weighted score = Σ(weight × dimension). Starting point from NEWS_AGENT.md §11. */
export const SCORE_WEIGHTS = {
  relevance: 0.35,
  importance: 0.3,
  sourceTrust: 0.2,
  freshness: 0.15,
} as const

/** Trust score (0–10) contributed by the best source tier backing a story. */
export const TIER_TRUST_SCORE: Record<1 | 2 | 3, number> = { 1: 10, 2: 7, 3: 3 }

/** Each additional independent publisher covering the story, capped. */
export const CORROBORATION_BONUS = 1
export const MAX_CORROBORATION_BONUS = 2

/** Freshness decays linearly to zero across this window. */
export const FRESHNESS_HALF_LIFE_HOURS = 48

export const DEDUPE = {
  /** Title similarity at or above this is the same story. */
  sameStoryThreshold: 0.62,
  /** Between this and sameStoryThreshold, merge but flag as ambiguous. */
  ambiguousThreshold: 0.5,
  /** Titles only cluster when published within this window of each other. */
  clusterWindowHours: 72,
} as const

/*
 * Tier-driven verification requirements (NEWS_AGENT.md §5).
 *
 * `requiresTier1` means no amount of Tier 2 corroboration substitutes for the
 * primary source — specific numbers must come from whoever owns them.
 */
export interface ClaimVerificationRule {
  requiresTier1: boolean
  minIndependentTier2: number
  /** A story is rejected when a claim of this type cannot be supported. */
  core: boolean
}

export const CLAIM_RULES: Record<string, ClaimVerificationRule> = {
  launch: { requiresTier1: false, minIndependentTier2: 2, core: true },
  capability: { requiresTier1: true, minIndependentTier2: 0, core: true },
  pricing: { requiresTier1: true, minIndependentTier2: 0, core: true },
  date: { requiresTier1: true, minIndependentTier2: 0, core: false },
  benchmark: { requiresTier1: true, minIndependentTier2: 0, core: false },
  quote: { requiresTier1: true, minIndependentTier2: 1, core: false },
  funding: { requiresTier1: false, minIndependentTier2: 1, core: false },
  other: { requiresTier1: false, minIndependentTier2: 1, core: false },
}

export const DEFAULT_CLAIM_RULE: ClaimVerificationRule = {
  requiresTier1: false,
  minIndependentTier2: 1,
  core: false,
}

/**
 * Hard relevance floor, applied independently of the weighted score.
 *
 * Source trust and the topic prior together contribute enough weight to carry a
 * story the classifier judged irrelevant past the score threshold. NEWS_AGENT.md
 * §11 says a keyword list "cannot on its own carry something the classifier
 * judged irrelevant", so this gate enforces that directly rather than relying on
 * the weights happening to balance.
 */
export const MIN_RELEVANCE = 4
export const MIN_IMPORTANCE = 3

/** A story needs this many verified claims before it is worth writing. */
export const MIN_VERIFIED_CLAIMS = 3

export const ARTICLE = {
  minWords: 500,
  maxWords: 900,
  /** Hard ceiling before the draft is rejected as runaway output. */
  hardMaxWords: 1400,
  minTags: 2,
  maxTags: 5,
  excerptMinChars: 80,
  excerptMaxChars: 320,
  titleMaxChars: 110,
} as const

/** Bounded writer→editor revision loop (§29 of the implementation brief). */
export const MAX_REVISION_ATTEMPTS = 1

/** Editor confidence at or above this is required for approval. */
export const MIN_APPROVAL_CONFIDENCE = 0.6

export const RETRY = {
  /** Transient HTTP failures (5xx, timeout, reset). */
  httpAttempts: 3,
  httpBaseDelayMs: 400,
  httpMaxDelayMs: 4000,
  /** Invalid LLM structured output: one repair pass, then one clean retry. */
  llmSchemaAttempts: 3,
  /** WordPress 5xx. */
  wordpressAttempts: 3,
  /** Redirects followed for externally-derived URLs. */
  maxRedirects: 3,
} as const

/*
 * Bounds on the pending-publication retry batch (§25: retries are bounded,
 * always).
 *
 * `maxPerRun` keeps a large backlog from turning one run into a long series of
 * CMS writes; the remainder is simply retried next run. `maxConsecutiveFailures`
 * abandons the batch once WordPress has failed twice in a row — at that point it
 * is down, and every further attempt costs a full HTTP retry ladder for nothing.
 * Neither bound ever discards an article: anything not attempted stays approved
 * with wp_post_id NULL and is found by the same query on the next run.
 */
export const PENDING_PUBLISH = {
  maxPerRun: 10,
  maxConsecutiveFailures: 2,
} as const

/**
 * Default models per task class. Overridable via LLM_MODEL_FAST/LLM_MODEL_STRONG.
 * The provider adapter decides what these strings mean; the pipeline only knows
 * "fast" and "strong" (NEWS_AGENT.md §12).
 */
export const TASK_MODEL_CLASS = {
  classify: 'fast',
  extract: 'fast',
  verify: 'strong',
  write: 'strong',
  edit: 'strong',
} as const

/** Output token ceilings per task — a runaway response is a bug, not content. */
export const TASK_MAX_OUTPUT_TOKENS = {
  classify: 512,
  extract: 2048,
  verify: 3072,
  write: 4096,
  edit: 2048,
} as const

/** Cleaned source text passed to extraction, in characters. */
export const MAX_EVIDENCE_CHARS = 24_000

/** Evidence pages fetched per story, beyond the originating items. */
export const MAX_EVIDENCE_FETCHES_PER_STORY = 4
