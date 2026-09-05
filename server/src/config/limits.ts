/*
 * Server-level constants.
 *
 * These are the knobs the server is expected to be tuned with. They live apart
 * from config/env.ts because they change for different reasons: env values
 * change per deployment, these change with measured behaviour. Same split as
 * news agent/src/config/limits.ts versus its env.ts.
 *
 * Phase B only. Retrieval weights (Phase C), LLM token ceilings (Phase D),
 * conversation caps (Phase F) and rate-limit thresholds (Phase I) belong to
 * their own phases and are deliberately absent — see
 * ASSISTANT_ARCHITECTURE_PLAN.md §14.
 */

export const HTTP = {
  /*
   * Maximum request body.
   *
   * POST /api/assistant/chat is the largest payload this API will ever accept
   * and ASSISTANT_ARCHITECTURE_PLAN.md §13 caps it at 32 KB. Setting the limit
   * now means the boundary is enforced before there is anything behind it to
   * abuse.
   */
  bodyLimitBytes: 32 * 1024,

  /** Rendered form of the same value; express.json() takes a string or bytes. */
  bodyLimit: '32kb',

  /*
   * How long in-flight requests get to finish after SIGTERM before the process
   * exits anyway. Bounded so a hung request cannot block a deploy forever.
   */
  shutdownGraceMs: 10_000,
} as const

export const HEALTH = {
  /** Path the health route is mounted at, relative to the API base. */
  path: '/health',
} as const

/** Base path every route in this server is mounted under. */
export const API_BASE_PATH = '/api'

/* ─── Phase C — retrieval ──────────────────────────────────────────────────── */

/**
 * Scoring weights. Score = Σ(weight × signal), each signal normalised to 0–1.
 *
 * The starting point is the table in ASSISTANT_ARCHITECTURE_PLAN.md §9, and the
 * plan is explicit that those numbers are a starting point rather than sacred
 * constants. Four changes were made while building the table-driven relevance
 * tests, each recorded here so the reasoning survives the commit:
 *
 *   nameToken (NEW, 1.2)  A query naming a tool partially — "opus clip for
 *                         shorts", "cursor vs copilot" — got no name credit at
 *                         all under exact-match-only, so a generic category
 *                         match outranked the tool the user actually named.
 *
 *   useCase   (NEW, 0.9)  The taxonomy carries 65 real goals seeded from the
 *                         design's SETUP_GOALS. Not scoring them wasted the
 *                         single most specific signal a record carries. Capped
 *                         at maxUseCaseMatches so a broad query cannot stack it.
 *
 *   verified  (NEW, 0.15) A deliberate thumb on the scale for editorially
 *                         checked records, small enough that it only breaks
 *                         ties. It is what stops an unreviewed submission from
 *                         outranking a verified tool on tag spam alone.
 *
 *   textOverlap (1.0)     Unchanged in weight, but measured as a FRACTION of
 *                         query terms matched rather than a raw count. A raw
 *                         count let a long summary accumulate overlap with a
 *                         long query and swamp the category signal entirely.
 *
 * Signals are normalised before weighting, so a weight is directly comparable
 * to every other weight. That is what makes a score breakdown readable.
 */
export const SCORE_WEIGHTS = {
  /** The query names the tool exactly ("descript", "opus clip"). */
  nameExact: 3.0,
  /** The query contains part of the tool's name. */
  nameToken: 1.2,
  /** An inferred category equals the tool's category. */
  category: 2.0,
  /** Fraction of query terms appearing in the tool's tags. */
  tagOverlap: 1.5,
  /** Fraction of query terms appearing in the name, tagline or summary. */
  textOverlap: 1.0,
  /** An inferred or supplied role is one the tool serves. */
  role: 0.8,
  /** Fraction of inferred workflow stages the tool covers. */
  stage: 0.6,
  /** Inferred goals the tool lists, capped. */
  useCase: 0.9,
  /** pop / 100. */
  popularity: 0.4,
  /** rating / 5. Unrated records (rating 0) contribute nothing, never a penalty. */
  rating: 0.2,
  /** Applied once when the tool violates a stated budget constraint. */
  pricingMismatch: -2.0,
  /** Editorially verified. Breaks ties only. */
  verified: 0.15,
} as const

export const RETRIEVAL = {
  /**
   * How many records are pulled from the repository before scoring.
   *
   * Comfortably above the whole seed catalogue, so V1 scores everything. It
   * exists so the day the catalogue outgrows memory the prefilter is already
   * the thing that gets pushed into SQL, rather than a change of shape.
   */
  prefilterLimit: 200,
  /** Candidates returned for a normal query (§9). */
  defaultCandidates: 30,
  /** Hard ceiling, whatever stage coverage asks for (§9). */
  maxCandidates: 40,
  /**
   * Candidates guaranteed per inferred workflow stage.
   *
   * Below two the model cannot make a real choice, and a model that cannot find
   * a tool for a stage it believes is necessary will invent one.
   */
  minPerStage: 2,
  /** Stages inferred from one query, highest-signal first. */
  maxInferredStages: 5,
  /** Ceiling on stacked useCase matches, so a broad query cannot run away. */
  maxUseCaseMatches: 3,
  /** A term shorter than this carries no signal and is dropped. */
  minTermLength: 3,
} as const

/** GET /api/tools and GET /api/tools/:slug. */
export const TOOLS_API = {
  path: '/tools',
  defaultLimit: 24,
  maxLimit: 50,
  /** Longer queries are rejected rather than truncated, so the caller knows. */
  maxQueryLength: 200,
} as const

export const TAXONOMY_API = {
  path: '/taxonomy',
} as const
