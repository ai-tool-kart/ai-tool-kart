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
  /**
   * Retained as the DEFAULT format's range and as schema bounds. Length is
   * governed per-article by ARTICLE_FORMATS below; nothing should treat these
   * two numbers as a universal minimum any more.
   */
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

/*
 * ── Article formats ──────────────────────────────────────────────────────────
 *
 * A single 500-word minimum was the wrong instrument. The first real article
 * came in at 176 words because its source — a GitHub changelog entry — supported
 * exactly eight small facts. The writer was right to stop; §14 forbids inventing
 * anything, so the only way to reach 500 words would have been padding, which is
 * the failure this pipeline exists to avoid. Yet the draft was then reported as
 * "short" against a target it could never legitimately have hit.
 *
 * So length is chosen from the evidence rather than fixed in advance. Depth of
 * verified material picks the format; the format sets the target range; the
 * writer and the editor are both told which one applies.
 *
 * The ordering matters: a short, fully-grounded article is a SUCCESS, not a
 * degraded standard article.
 */
export const ARTICLE_FORMATS = {
  /** A changelog entry, a deprecation, a single well-sourced announcement. */
  brief: { minWords: 180, maxWords: 350, minSections: 3, maxSections: 5 },
  /** The common case: a launch or capability change with real detail. */
  standard: { minWords: 500, maxWords: 900, minSections: 4, maxSections: 7 },
  /** Only when the evidence genuinely carries it. Never reached by padding. */
  analysis: { minWords: 900, maxWords: 1400, minSections: 5, maxSections: 9 },
} as const

export type ArticleFormat = keyof typeof ARTICLE_FORMATS

export const DEFAULT_ARTICLE_FORMAT: ArticleFormat = 'standard'

/**
 * Evidence thresholds a story must MEET to earn each format.
 *
 * Read as "at least this much". Everything below `standard` is a brief, which is
 * why brief has no entry: it is the floor, not a bar to clear.
 *
 * `substantiveClaims` counts VERIFIED claims only — single-source claims can
 * appear in the prose with attribution, but they must not be what buys a longer
 * article, or the format becomes a way to launder weak sourcing into length.
 */
export const FORMAT_THRESHOLDS = {
  standard: {
    substantiveClaims: 6,
    evidenceSources: 2,
    independentPublishers: 2,
    importance: 0,
  },
  analysis: {
    substantiveClaims: 12,
    evidenceSources: 3,
    independentPublishers: 3,
    importance: 7,
  },
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

/*
 * ── SEO constraints ──────────────────────────────────────────────────────────
 *
 * The governing rule is in NEWS_AGENT.md: SEO shapes STRUCTURE AND WORDING; it
 * never invents facts. Everything here is a shape constraint, not a licence to
 * say something the claims do not support.
 */
export const SEO = {
  /** Google truncates around 155-160 chars; below ~50 is not a description. */
  metaDescriptionMinChars: 50,
  metaDescriptionMaxChars: 160,
  /** An SEO title longer than this is truncated in results. */
  seoTitleMaxChars: 60,
  /** Hard schema ceiling; the soft target is seoTitleMaxChars. */
  seoTitleHardMaxChars: 80,
  minSecondaryKeywords: 0,
  maxSecondaryKeywords: 6,
  maxSuggestedHeadings: 8,
  maxInternalLinks: 4,
  /**
   * Times the primary keyword may appear across title + headings + meta before
   * it reads as stuffing. Deliberately a count, not a density percentage —
   * density targets are what produce robotic copy.
   */
  maxPrimaryKeywordRepeats: 4,
} as const

/**
 * Comparative and superlative language that asserts a ranking.
 *
 * None of these may appear in SEO output unless the same word appears in a
 * VERIFIED claim. A news pipeline has no basis for "the best AI coding tool" —
 * that is a claim about every competitor, none of which were verified. This is
 * the single highest-risk way SEO could smuggle an unsupported assertion into a
 * headline, so it is checked deterministically rather than left to a prompt.
 */
export const UNSUPPORTED_SUPERLATIVES = [
  'best', 'top', 'cheapest', 'fastest', 'greatest', 'leading', 'number one',
  'number 1', '#1', 'ultimate', 'perfect', 'flawless', 'unbeatable', 'revolutionary',
  'game-changing', 'game changing', 'most powerful', 'most advanced', 'world-class',
  'industry-leading', 'unrivalled', 'unrivaled', 'superior', 'must-have',
] as const

/**
 * Per-format SEO shape. Mirrors ARTICLE_FORMATS: a brief gets a brief's SEO.
 *
 * Without this, SEO becomes a back door to the padding that ARTICLE_FORMATS
 * exists to prevent — "add an H2 for the secondary keyword" is exactly how a
 * 200-word brief turns into 600 words of nothing.
 */
export const SEO_BY_FORMAT = {
  brief: { maxHeadings: 3, maxSecondaryKeywords: 2, maxInternalLinks: 2 },
  standard: { maxHeadings: 6, maxSecondaryKeywords: 4, maxInternalLinks: 3 },
  analysis: { maxHeadings: 8, maxSecondaryKeywords: 6, maxInternalLinks: 4 },
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
  /*
   * SEO runs on the fast model. It produces short, highly-constrained metadata
   * from claims another step already verified, and every factual guarantee it
   * could threaten is enforced deterministically afterwards (seo/validate.ts)
   * rather than trusted to the model. There is no reasoning here worth paying
   * strong-model rates for.
   */
  seo: 'fast',
  write: 'strong',
  edit: 'strong',
} as const

/** Output token ceilings per task — a runaway response is a bug, not content. */
export const TASK_MAX_OUTPUT_TOKENS = {
  classify: 512,
  extract: 2048,
  verify: 3072,
  seo: 1024,
  write: 4096,
  edit: 2048,
} as const

/** Cleaned source text passed to extraction, in characters. */
export const MAX_EVIDENCE_CHARS = 24_000

/** Evidence pages fetched per story, beyond the originating items. */
export const MAX_EVIDENCE_FETCHES_PER_STORY = 4
