/*
 * Error model.
 *
 * One concrete class, not a hierarchy — the same choice the news agent makes in
 * news agent/src/domain/errors.ts. Errors are classified by what the caller
 * should DO about them, which here means two things: what HTTP status to send,
 * and whether the message is safe to show a client.
 *
 * The safety rule is structural rather than a per-error flag:
 *
 *   - An ApiError was constructed by us, so its `message` is client-safe...
 *   - ...EXCEPT for code 'INTERNAL', whose message is always replaced by a
 *     fixed string on the way out.
 *   - Anything that is not an ApiError becomes an INTERNAL, so an unexpected
 *     throw can never leak a stack trace, a file path, or a driver message.
 *
 * A flag would let a future caller mark the wrong error exposable. A rule keyed
 * on the code cannot be got wrong at the call site.
 *
 * `erasableSyntaxOnly` is on, so no parameter properties: every field is
 * assigned explicitly.
 */

/**
 * The vocabulary, extended one phase at a time.
 *
 * Phase B declared the first four. Phase E adds the two the assistant can
 * actually reach (ASSISTANT_ARCHITECTURE_PLAN.md §13); Phase I adds
 * RATE_LIMITED, which is deliberately still absent — an unreachable error code
 * is dead vocabulary that invites someone to build the response before the
 * system behind it exists.
 *
 * The two new codes describe WHOSE failure it was, which is what decides whether
 * retrying is worth anything:
 *
 *   ASSISTANT_UNAVAILABLE  422  The model answered, repeatedly, with something
 *                               that did not satisfy the schema. The request was
 *                               fine; the answer was not. Retrying may help.
 *   PROVIDER_UNAVAILABLE   503  The provider errored, refused, or the turn's
 *                               budget tripped. Nothing was produced at all.
 *
 * Two more were added for the Submit intake (SPEC-submit-backend.md §7),
 * after a first pass gave that one route its own flat, non-`{code,message}`
 * error shape and that turned out to be a mistake — the single-errorHandler
 * contract this file exists to enforce wins, not a per-route exception:
 *
 *   VALIDATION_FAILED      400  The submission failed schema validation.
 *                               Carries `fields` (below) so the form can
 *                               attach each message to its own input.
 *   DUPLICATE_URL          409  The normalized siteUrl already exists, in
 *                               the submission store or the live catalogue.
 */
export type ApiErrorCode =
  | 'CONFIG'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'ASSISTANT_UNAVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'VALIDATION_FAILED'
  | 'DUPLICATE_URL'
  | 'INTERNAL'

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  CONFIG: 500,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  ASSISTANT_UNAVAILABLE: 422,
  PROVIDER_UNAVAILABLE: 503,
  VALIDATION_FAILED: 400,
  DUPLICATE_URL: 409,
  INTERNAL: 500,
}

export interface ApiErrorOptions {
  cause?: unknown
  /** HTTP status override. Defaults to the code's canonical status. */
  status?: number
  /** Structured context. Logged always; sent to the client only when safe. */
  details?: Record<string, unknown>
  /**
   * Per-field messages, keyed by the client's own field names — e.g.
   * `{ tagline: "Must be 80 characters or fewer" }`. Optional, and specific
   * to VALIDATION_FAILED today; errorHandler.ts includes it in the response
   * body only when present, so every other error's shape is unaffected.
   */
  fields?: Record<string, string>
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: Record<string, unknown>
  readonly fields?: Record<string, string>

  constructor(code: ApiErrorCode, message: string, options: ApiErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'ApiError'
    this.code = code
    this.status = options.status ?? DEFAULT_STATUS[code]
    this.details = options.details ?? {}
    this.fields = options.fields
  }
}

/**
 * Bad or missing configuration.
 *
 * Startup-only. The process exits before it can serve anything, so this never
 * reaches a response body — it is an ApiError so that one error shape covers
 * the whole server, not because it is ever rendered.
 */
export function configError(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError('CONFIG', message, { details })
}

/** The request was malformed. `details` names what failed, never why internally. */
export function invalidRequest(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError('INVALID_REQUEST', message, { details })
}

export function notFound(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError('NOT_FOUND', message, { details })
}

/** A submission failed schema validation. `fields` is what the form renders. */
export function validationFailed(
  message: string,
  fields?: Record<string, string>,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('VALIDATION_FAILED', message, { fields, details })
}

/** A submission's normalized siteUrl already exists — store or catalogue, caller's choice which. */
export function duplicateUrl(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError('DUPLICATE_URL', message, { details })
}

/**
 * The model could not produce a valid answer.
 *
 * Distinct from PROVIDER_UNAVAILABLE because the two are different operational
 * problems: this one is a prompt or a model regression and shows up in the logs
 * as schema failures; the other is an outage.
 */
export function assistantUnavailable(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('ASSISTANT_UNAVAILABLE', message, { details })
}

/** The provider errored, refused, or the turn's budget was exhausted. */
export function providerUnavailable(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError('PROVIDER_UNAVAILABLE', message, { details })
}

/** Wraps an unexpected failure. The message is never sent to the client. */
export function internalError(message: string, cause?: unknown): ApiError {
  return new ApiError('INTERNAL', message, { cause })
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

/** Message text for any thrown value, for logs that must never crash. */
export function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
