/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The LLM layer's own error vocabulary.
 *
 * ── Why this is not the server's ApiError ─────────────────────────────────────
 *
 * src/domain/errors.ts models errors by HTTP STATUS, because everything else in
 * the server ends up in a response body. This directory does not: it is destined
 * for shared/llm in Phase H, where it will be imported by the News Agent, which
 * has no HTTP layer at all. An LLM client that throws an object carrying a `409`
 * would be an LLM client that cannot be shared.
 *
 * So the codes mirror the News Agent's AgentError subset exactly —
 * LLM_UNAVAILABLE, LLM_SCHEMA, LLM_REFUSAL, BUDGET_EXCEEDED — and Phase E maps
 * them onto the HTTP contract in ASSISTANT_ARCHITECTURE_PLAN.md §13 at the route
 * boundary, where that translation belongs:
 *
 *   LLM_SCHEMA       → 422 ASSISTANT_UNAVAILABLE
 *   LLM_REFUSAL      → 503 PROVIDER_UNAVAILABLE
 *   LLM_UNAVAILABLE  → 503 PROVIDER_UNAVAILABLE
 *   BUDGET_EXCEEDED  → 503 PROVIDER_UNAVAILABLE
 *
 * Those mappings are documented here and implemented in Phase E. Declaring the
 * HTTP codes now would be dead vocabulary — the rule domain/errors.ts already
 * states.
 *
 * `erasableSyntaxOnly` is on, so no parameter properties: every field is
 * assigned explicitly.
 */

/** Mirrors the LLM-relevant subset of the News Agent's AgentErrorCode. */
export type LLMErrorCode = 'LLM_UNAVAILABLE' | 'LLM_SCHEMA' | 'LLM_REFUSAL' | 'BUDGET_EXCEEDED'

export interface LLMErrorOptions {
  cause?: unknown
  /** Structured context. Logged; never contains prompt or model output text. */
  details?: Record<string, unknown>
  /**
   * False when asking again cannot help — a rejected credential, a model id
   * that does not exist, a rate limit, a timeout. client.ts stops at the first
   * such failure instead of spending the rest of the attempt ladder on it.
   * Defaults to true, which is what every error meant before the flag existed.
   */
  retryable?: boolean
}

export class LLMError extends Error {
  readonly code: LLMErrorCode
  readonly details: Record<string, unknown>
  readonly retryable: boolean

  constructor(code: LLMErrorCode, message: string, options: LLMErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'LLMError'
    this.code = code
    this.details = options.details ?? {}
    this.retryable = options.retryable ?? true
  }
}

export function isLLMError(value: unknown): value is LLMError {
  return value instanceof LLMError
}

/** The provider errored, timed out, or was unreachable. */
export function llmUnavailable(message: string, options: LLMErrorOptions = {}): LLMError {
  return new LLMError('LLM_UNAVAILABLE', message, options)
}

/** The response was not valid JSON, or did not satisfy the schema. */
export function llmSchemaError(message: string, options: LLMErrorOptions = {}): LLMError {
  return new LLMError('LLM_SCHEMA', message, options)
}

/** The model declined rather than failed. */
export function llmRefused(message: string, options: LLMErrorOptions = {}): LLMError {
  return new LLMError('LLM_REFUSAL', message, options)
}

/** A spending cap was reached. Says nothing about the quality of the request. */
export function budgetExceeded(message: string, details?: Record<string, unknown>): LLMError {
  return new LLMError('BUDGET_EXCEEDED', message, { details })
}
