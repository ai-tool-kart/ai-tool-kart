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
 * Phase B vocabulary.
 *
 * Later phases extend this union rather than inventing parallel error types —
 * Phase E adds ASSISTANT_UNAVAILABLE and PROVIDER_UNAVAILABLE, Phase I adds
 * RATE_LIMITED (ASSISTANT_ARCHITECTURE_PLAN.md §13). They are deliberately not
 * declared yet: an unreachable error code is dead vocabulary that invites
 * someone to build the response before the system behind it exists.
 */
export type ApiErrorCode = 'CONFIG' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'INTERNAL'

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  CONFIG: 500,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL: 500,
}

export interface ApiErrorOptions {
  cause?: unknown
  /** HTTP status override. Defaults to the code's canonical status. */
  status?: number
  /** Structured context. Logged always; sent to the client only when safe. */
  details?: Record<string, unknown>
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(code: ApiErrorCode, message: string, options: ApiErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'ApiError'
    this.code = code
    this.status = options.status ?? DEFAULT_STATUS[code]
    this.details = options.details ?? {}
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
