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

/* ─── Phase D — the LLM layer ──────────────────────────────────────────────── */

/*
 * These four constants mirror news agent/src/config/limits.ts, because
 * server/src/llm/ is an explicitly temporary copy of the News Agent's LLM layer
 * (ASSISTANT_ARCHITECTURE_PLAN.md §12). Phase H moves them into shared/llm
 * alongside the code that reads them — the plan calls that out specifically,
 * because adding a task currently means touching provider.ts and limits.ts
 * together, and that coupling belongs inside one package.
 */

export const LLM_RETRY = {
  /**
   * Attempts at getting valid structured output: one try, one repair pass, one
   * clean retry.
   *
   * Three is the number the News Agent settled on and the plan specifies. Two
   * gives the repair instruction no second chance after a transient blip; four
   * mostly buys latency, because a model that has failed the same schema three
   * times is failing for a reason a fourth attempt will not fix.
   */
  schemaAttempts: 3,
} as const

/**
 * Model class per task.
 *
 * `assistant` is `strong`: it has to read forty candidate cards, infer intent
 * from one sentence, and emit a six-section plan whose every tool id must be
 * real. That is not a fast-class job.
 */
export const TASK_MODEL_CLASS = {
  assistant: 'strong',
} as const

/**
 * Output token ceilings per task — a runaway response is a bug, not content.
 *
 * 2048 for the assistant, per the plan. A full six-section plan with five tools
 * and five workflow stages lands comfortably inside it; anything materially
 * larger means the model is writing prose it was asked not to write.
 */
export const TASK_MAX_OUTPUT_TOKENS = {
  assistant: 2048,
} as const

/**
 * Spend ceiling for one unit of work.
 *
 * Phase E creates one budget per assistant turn, so a single pathological
 * conversation cannot consume another request's headroom. Sized for the repair
 * loop: three attempts at 2048 output tokens, plus the input side of a ~1.5k
 * candidate table, with room to spare.
 *
 * This is a circuit breaker, not billing and not a rate limiter. Per-IP rate
 * limiting arrives in Phase I (§13).
 */
export const LLM_BUDGET = {
  maxLlmCalls: LLM_RETRY.schemaAttempts,
  maxTokens: 60_000,
} as const

/* ─── Phase E — the assistant ──────────────────────────────────────────────── */

/**
 * The assistant's request, response and conversation caps.
 *
 * Every number here is from ASSISTANT_ARCHITECTURE_PLAN.md §10.1, §11 and §13.
 * They live in config rather than inside the Zod schema for the same reason
 * SCORE_WEIGHTS does not live inside score.ts: tuning a limit must not mean
 * editing the logic that enforces it, and "what is the cap" must have exactly
 * one answer.
 *
 * ── Where the plan's numbers were relaxed, and why ───────────────────────────
 *
 * §10.1 describes a plan as 2–6 tools, 3–5 workflow stages and 3–5 steps. The
 * MAXIMA are enforced by the schema. The MINIMA are not, and that is deliberate:
 * they are enforced by the prompt instead.
 *
 * A minimum in the schema is a rejection. If retrieval can only offer one
 * candidate — a narrow query against a young catalogue — a model that correctly
 * recommends that one tool would fail validation three times and the turn would
 * end in a 422, which is a worse answer than the honest single-tool plan. The
 * failure mode of a missing minimum is a thin plan; the failure mode of an
 * enforced one is no plan at all.
 */
export const ASSISTANT = {
  /** Path the assistant router is mounted at, relative to the API base. */
  path: '/assistant',
  /** POST target, relative to the router. */
  chatPath: '/chat',

  /* ── Request (§13) ─────────────────────────────────────────────────────── */
  /** The current message. Longer is rejected — the caller must know it was cut. */
  maxMessageChars: 2_000,
  /** Prior turns kept. Older ones are TRUNCATED, never rejected (§11). */
  maxHistoryTurns: 8,
  /** Per-message ceiling inside the history. Truncated, not rejected. */
  maxHistoryMessageChars: 2_000,
  /** Conversation length before `turn` stops counting up. Truncated (§11). */
  maxConversationTurns: 12,

  /* ── Response (§10.1) ──────────────────────────────────────────────────── */
  maxMessageReplyChars: 600,
  maxPlanTools: 6,
  maxAgents: 3,
  maxWorkflowStages: 5,
  maxWhyChars: 160,
  maxSteps: 6,
  maxFollowUps: 3,
  maxConstraints: 4,
  /** Free-text fields the model fills. Bounded so a runaway string is a reject. */
  maxTitleChars: 120,
  maxRoleChars: 80,
  maxGoalChars: 200,
  maxConstraintChars: 80,
  maxStepChars: 240,
  maxNoteChars: 240,
  maxFollowUpChars: 120,
  maxAgentChars: 60,
  maxStageChars: 40,
  /** A catalogue id. Long enough for any slug, short enough to bound the parse. */
  maxToolIdChars: 64,

  /* ── Context (§11) ─────────────────────────────────────────────────────── */
  /** Ids carried in the conversation context, per list. */
  maxContextToolIds: 20,
} as const
