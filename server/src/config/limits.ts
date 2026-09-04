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
