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
  /**
   * The user said they already use this tool (Phase F).
   *
   * Sized deliberately between `role` (0.8) and `stage` (0.6): strong enough to
   * lift a tool the user already owns above an equally relevant alternative,
   * far too weak to drag an irrelevant tool into a plan. A preference is not a
   * filter — see the note on QueryContext.confirmedToolIds.
   */
  confirmed: 0.7,
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

/**
 * GET /api/usage-stories — the homepage's "How People Are Using AI" rail.
 *
 * Editorial content rather than catalogue data, so it has no default limit: the
 * rail renders the whole set and duplicates it to loop, and a default that
 * silently truncated the set would shorten the loop with nothing saying why.
 * `maxLimit` only bounds what a caller may ask for.
 */
export const STORIES_API = {
  path: '/usage-stories',
  maxLimit: 50,
} as const

/**
 * GET /api/work-savings — the role estimates behind "See What AI Can Save You".
 *
 * Editorial content, like the stories, so it has no default limit: the selector
 * offers every role it holds and a silent truncation would drop roles from a
 * dropdown with nothing saying why. `maxLimit` only bounds what a caller may
 * ask for.
 */
export const SAVINGS_API = {
  path: '/work-savings',
  maxLimit: 50,
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
 * The plan is a flat list of steps, at most `maxPlanSteps`. The MAXIMUM is
 * enforced by the schema. There is no MINIMUM there, and that is deliberate: it
 * is enforced by the prompt instead.
 *
 * A minimum in the schema is a rejection. If retrieval can only offer one
 * candidate — a narrow query against a young catalogue — a model that correctly
 * recommends that one tool would fail validation three times and the turn would
 * end in a 422, which is a worse answer than the honest single-step plan. The
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

  /* ── Response (§10.1, simplified — see the plain-language plan note) ──── */
  maxMessageReplyChars: 600,
  /** A plan is at most this many steps. Each step names one stage and one tool. */
  maxPlanSteps: 4,
  /** Alternates shown under a step's main pick, e.g. "Also good: X, Y". */
  maxAlsoGood: 2,
  /**
   * How a step's tool pool is cut from the ranked candidate list, before
   * grouping by primary stage: a tool must score at least this fraction of
   * the top candidate's score, and the pool is capped regardless.
   *
   * Below this line a tool did not really compete for the request — it is in
   * the candidate set because retrieval keeps a broad pool for stage
   * coverage and follow-up chips, not because it is a plausible pick. A plan
   * built from the whole pool could put a tool scoring half the leader's
   * relevance forward as an "also good" alternative, which reads as an
   * endorsement the numbers do not support.
   */
  stepScoreCutoffRatio: 0.75,
  /** Hard ceiling on the tool pool the cutoff above can leave standing. */
  maxStepCandidates: 6,
  maxFollowUps: 3,
  maxConstraints: 4,
  /** Free-text fields the model fills. Bounded so a runaway string is a reject. */
  maxRoleChars: 80,
  maxGoalChars: 200,
  maxConstraintChars: 80,
  maxFollowUpChars: 120,
  /** A catalogue id. Long enough for any slug, short enough to bound the parse. */
  maxToolIdChars: 64,

  /* ── Context (§11) ─────────────────────────────────────────────────────── */
  /** Ids carried in the conversation context, per list. */
  maxContextToolIds: 20,

  /* ── Refinement (Phase F) ──────────────────────────────────────────────── */
  /**
   * Topic terms accumulated into `context.goal`.
   *
   * The goal is re-fed into the retrieval query on every later turn, which is
   * what carries "video editing" forward when turn two only says "not
   * Descript". Eight is the point where it stops being a topic and starts being
   * a transcript: past that the accumulated terms outweigh the message the user
   * actually just typed.
   */
  maxGoalTerms: 8,
  /** Category focuses recorded from one turn, e.g. "focus on Code". */
  maxCategoryFocus: 2,
  /** Tool names resolved from one message, per direction. */
  maxToolPhrases: 4,
  /** Words taken after a rejection or confirmation marker before resolving. */
  maxToolPhraseWords: 4,

  /* ── The step-by-step guide above the plan ─────────────────────────────── */
  /**
   * How much of the message's rarity the top automation's TITLE must account
   * for before the guide is shown, as a multiple of AUTOMATION_MATCH.idfBase.
   * The engine reads AutomationMatch.titleWeight against it.
   *
   * ── Why a title weight, and not a signal count or a coverage share ───────
   *
   * This replaced a two-signal rule (at least two of titlePhrase, titleTerms,
   * intentTerms, personaTerms, toolTerms above zero). Counting fields cannot
   * separate a real match from a coincidence, because a record can agree with
   * three fields on nothing but the query's commonest words: "edit videos
   * faster" is a genuine THREE-signal match against a scholarship intro
   * video, on `video` in its title and `edit` in its intent labels.
   *
   * An IDF coverage SHARE — the matched terms as a fraction of the query's
   * total weight — was measured next and is worse than useless here: it is
   * scale-free, so it divides out the very quantity that separates the cases.
   * All four known-bad queries score 1.000 and the lowest score in the set
   * belongs to a query that should qualify. The full table is in
   * SPEC-automations.md §7.
   *
   * What separates them is the ABSOLUTE rarity the title accounts for, which
   * is what this is. Measured over the 1,560 imported automations:
   *
   *     16.93  review a contract before I sign it              show
   *     14.34  help me write a cover letter                    show
   *      9.99  make a study schedule                           show
   *      8.05  follow up with clients automatically            show
   *      6.41  I am a teacher and I want to grade essays…      show
   *   ──────── 5.2, this floor, mid-gap ───────────────────────────────
   *      4.02  edit videos faster                              hide
   *      4.02  I need AI tools for video editing               hide
   *      3.52  help me with marketing                          hide
   *      3.26  I need something for my business                hide
   *
   * automationMatch.test.ts pins all nine, so a weight or data change that
   * closes the gap fails loudly instead of quietly showing the scholarship
   * video again.
   *
   * ── On the unit ──────────────────────────────────────────────────────────
   *
   * A multiple of idfBase, because idfBase is the floor of the IDF scale: a
   * term in EVERY automation is worth exactly idfBase, so "5.2" reads as "the
   * title carries what 5.2 of the commonest possible terms would be worth".
   * Today idfBase is 1, so the absolute value is 5.2 nats — a title holding
   * one term that appears in ~28 of 1,560 automations clears it alone.
   *
   * Be clear about what that unit does NOT buy: it pins the threshold to the
   * BOTTOM of the scale, not to the catalogue's size. Every idf also carries
   * ln((N + smoothing) / (df + smoothing)), so as the imported set grows the
   * whole scale stretches and a fixed multiple slowly gets easier to clear.
   * The real guard against that is re-measuring the nine on import, which the
   * test does on every run; this unit only stops the number being a bare
   * quantity of nats with nothing to read it against.
   */
  automationMinTitleWeight: 5.2,
} as const

/* ─── Submissions — SPEC-submit-backend.md §6, §7 ──────────────────────────── */

/**
 * Route mount point and length caps for the Submit intake
 * (submissions/schema.ts, http/routes/submissions.ts). `path` gives
 * `POST /api/submissions` per §7.
 *
 * The length caps mirror client/src/types/submit.ts's own constants
 * (TAGLINE_MAX, DESCRIPTION_MAX, MAX_TAGS, MAX_ALTERNATIVES, MAX_FAQS,
 * LAUNCH_STORY_MAX) — deliberately duplicated, not imported, per the spec's
 * §6 note: the client/server boundary is not worth a shared package yet,
 * and a half-working path alias across it would be worse than an honest
 * copy. If the two drift and it starts causing bugs, the fix is a real
 * `shared/` workspace, not a one-off import.
 */
/**
 * Per-field length/range limits the catalogue schema enforces
 * (catalogue/schema.ts's `ToolSchema`) — the single place both the schema
 * and the review script's live prompt-time validation (review/validate.ts)
 * read them from, so the two can never drift apart the way a second,
 * hand-copied "40" and "600" would.
 *
 * Scoped to exactly the fields the review script prompts for (mono, price,
 * pop, tags, summary, slug) — name/tagline/trend/badge/api/ctx/team/trial/
 * integr are never reviewer-entered (copied from the submission or fixed by
 * buildTool.ts), so their limits stay inline in schema.ts, same as before.
 */
export const TOOL_FIELDS = {
  /** `mono` — the two-character card-avatar monogram. Fixed length, not a range. */
  monoLength: 2,
  /** `price` — the display price string. */
  priceMaxChars: 60,
  /** `pop` — editorial prominence score. */
  popMin: 0,
  popMax: 100,
  /** `tags` — each entry, and the array itself. */
  tagMaxChars: 40,
  tagsMin: 1,
  tagsMax: 12,
  /** `summary` — what retrieval and the assistant reason over. */
  summaryMinChars: 40,
  summaryMaxChars: 600,
  /** `slug`/`id` — see catalogue/schema.ts's SLUG_PATTERN for the format rule. */
  slugMaxChars: 64,
} as const

export const SUBMISSIONS = {
  path: '/submissions',

  maxSiteUrlChars: 2048,
  maxNameChars: 80,
  maxTaglineChars: 80,
  maxDescriptionChars: 2000,
  maxPriceChars: 80,
  maxTags: 6,
  maxTagChars: 40,
  maxAudienceChars: 200,
  maxAlternatives: 6,
  maxAlternativeChars: 80,
  maxFaqs: 5,
  maxFaqQuestionChars: 200,
  maxFaqAnswerChars: 1000,
  maxLaunchStoryChars: 600,
  /** The honeypot field (`company`, SPEC-submit-backend.md §9) — a bot's junk, not a real name. */
  maxHoneypotChars: 200,
} as const

/**
 * Rate limiting for the Submit intake — SPEC-submit-backend.md §9.
 * http/middleware/rateLimit.ts is the only module that reads these.
 */
export const RATE_LIMIT = {
  /**
   * Requests a single IP may make inside the rolling window. Raised from 5 to
   * 20 for slice 6 (client wiring, SPEC-submit-backend.md §8): the limiter
   * counts every request regardless of outcome, so 5 left no room for an
   * honest user who hits a 409 or two, fixes a typo, and tries again a few
   * times in one sitting.
   */
  maxPerWindow: 20,
  /** The rolling window's length, in milliseconds. */
  windowMs: 60 * 60 * 1000,
} as const

/**
 * Per-field length/count limits automations/schema.ts enforces
 * (SPEC-automations.md §3). Same reasoning as TOOL_FIELDS above: tuning a
 * cap must never mean editing the validation logic that enforces it.
 *
 * A rating-scale bound (`trustScore` 1–5) and a fixed literal union
 * (`beginnerFriendly`, `status`) are not "caps" in this sense — catalogue/
 * schema.ts's own `rating: z.number().min(0).max(5)` sets the same
 * precedent of leaving a domain-fixed scale inline rather than here.
 */
export const AUTOMATIONS = {
  idMaxChars: 64,
  slugMaxChars: 64,
  personaMaxChars: 300,
  titleMaxChars: 160,
  intentLabelMaxChars: 80,
  maxIntentLabels: 12,
  toolNameMaxChars: 80,
  toolAccessNoteMaxChars: 200,
  maxTools: 6,
  workflowSummaryMaxChars: 1000,
  samplePromptMaxChars: 4000,
  pricingNoteMaxChars: 500,
  /** The sheet's Niche/Industry cell; the longest surveyed is 97. */
  sectorMaxChars: 160,
  /** Beginner-Friendly after its leading word; the longest surveyed cell is 217. */
  beginnerNoteMaxChars: 300,
  sourceTypeMaxChars: 120,
  freshnessMaxChars: 100,
  accessNotesMaxChars: 800,
  batchMaxChars: 80,
  /** `AutomationStep` fields — one authored step, not the derived default. */
  stepTitleMaxChars: 80,
  stepBodyMaxChars: 600,
  stepPromptMaxChars: 4000,
  stepToolNameMaxChars: 80,
  stepTipMaxChars: 300,
  maxSteps: 6,
} as const

/**
 * Automation search weights — SPEC-automations.md §7.
 *
 * Here and not in automations/match.ts for the reason SCORE_WEIGHTS is not in
 * retrieval/score.ts: tuning relevance must not mean editing scoring logic,
 * and boundary.test.ts holds match.ts to that.
 *
 * Every signal but the phrase hit is normalised to 0–1 before weighting — an
 * overlap is the SHARE of query terms the field contains, not a count — so a
 * weight reads directly against every other. The client wrote Task Title and
 * Intent Labels as the phrases a user would type, which is why they dominate.
 */
export const AUTOMATION_MATCH_WEIGHTS = {
  /** The whole query appears in the title, word for word. */
  titlePhrase: 3.0,
  /** Share of query terms found in the title. */
  titleTerms: 1.5,
  /** Share of query terms found across the intent labels. */
  intentTerms: 1.2,
  /** Share of query terms found in the persona. */
  personaTerms: 0.6,
  /** Share of query terms found in the tool names. */
  toolTerms: 0.5,
  /**
   * trustScore / 5. A near-tiebreak: the most and least trusted records differ
   * by at most 0.08, so it decides only between text matches that close.
   */
  trust: 0.1,
} as const

/** Automation search limits. */
export const AUTOMATION_MATCH = {
  /** Results when the caller names no limit. */
  defaultLimit: 10,
  /** Hard ceiling on results, whatever the caller asks for. */
  maxLimit: 50,
  /** Shorter query terms are dropped as noise — same floor as RETRIEVAL. */
  minTermLength: 3,
  /**
   * Term rarity (IDF): idf = ln((N + idfSmoothing) / (df + idfSmoothing)) + idfBase,
   * where N is the automations the matcher was built over and df how many of
   * them contain the term in any scored field. Smoothing keeps an unseen term
   * finite; the base keeps the most common term above zero, so it still counts
   * a little rather than vanishing.
   */
  idfSmoothing: 1,
  idfBase: 1,
} as const

/** GET /api/automations — SPEC-automations.md §9. */
export const AUTOMATIONS_API = {
  path: '/automations',
  defaultLimit: AUTOMATION_MATCH.defaultLimit,
  /** The matcher's own ceiling, so a search and a listing cap alike. */
  maxLimit: AUTOMATION_MATCH.maxLimit,
  /** Longer queries are rejected rather than truncated, so the caller knows. */
  maxQueryLength: 200,
} as const
