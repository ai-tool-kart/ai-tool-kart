/*
 * Error taxonomy.
 *
 * The pipeline distinguishes errors by what the run should DO about them, not by
 * where they came from. Three properties drive that decision:
 *
 *   fatal      — abort the whole run (NEWS_AGENT.md §7: only lock failure and
 *                database failure qualify)
 *   retryable  — a bounded retry may succeed (§25)
 *   storyScoped— isolate to one story; the run continues (§24)
 *
 * `erasableSyntaxOnly` is on, so no parameter properties: every field is
 * assigned explicitly.
 */

export type ErrorCode =
  | 'CONFIG'
  | 'STORAGE'
  | 'RUN_LOCK'
  | 'SOURCE_FETCH'
  | 'SOURCE_PARSE'
  | 'URL_REJECTED'
  | 'HTTP'
  | 'LLM_UNAVAILABLE'
  | 'LLM_SCHEMA'
  | 'LLM_REFUSAL'
  | 'BUDGET_EXCEEDED'
  | 'EVIDENCE_INSUFFICIENT'
  | 'VERIFICATION_FAILED'
  | 'EDITORIAL_REJECTED'
  | 'WORDPRESS'
  | 'WORDPRESS_AUTH'

export interface AgentErrorOptions {
  cause?: unknown
  retryable?: boolean
  fatal?: boolean
  storyScoped?: boolean
  details?: Record<string, unknown>
}

export class AgentError extends Error {
  readonly code: ErrorCode
  readonly retryable: boolean
  readonly fatal: boolean
  readonly storyScoped: boolean
  readonly details: Record<string, unknown>

  constructor(code: ErrorCode, message: string, options: AgentErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'AgentError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.fatal = options.fatal ?? false
    this.storyScoped = options.storyScoped ?? false
    this.details = options.details ?? {}
  }
}

/** Bad or missing configuration. Always fatal — nothing downstream can work. */
export function configError(message: string, details?: Record<string, unknown>): AgentError {
  return new AgentError('CONFIG', message, { fatal: true, details })
}

/**
 * Database failure. Always fatal: dedupe and idempotency bookkeeping are what
 * prevent duplicate WordPress drafts, so a run that cannot trust its own state
 * must stop rather than publish (NEWS_AGENT.md §24).
 */
export function storageError(message: string, cause?: unknown): AgentError {
  return new AgentError('STORAGE', message, { fatal: true, cause })
}

export function runLockError(message: string, details?: Record<string, unknown>): AgentError {
  return new AgentError('RUN_LOCK', message, { fatal: true, details })
}

/** A source is down or malformed. Never fatal — the run continues (§24). */
export function sourceError(
  code: 'SOURCE_FETCH' | 'SOURCE_PARSE',
  message: string,
  details?: Record<string, unknown>,
): AgentError {
  return new AgentError(code, message, { details })
}

/** A URL failed validation (scheme, private address, redirect limit). */
export function urlRejected(message: string, details?: Record<string, unknown>): AgentError {
  return new AgentError('URL_REJECTED', message, { details })
}

export function budgetExceeded(message: string, details?: Record<string, unknown>): AgentError {
  return new AgentError('BUDGET_EXCEEDED', message, { details })
}

/** Story-scoped failures: mark the story, keep the run going. */
export function storyError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): AgentError {
  return new AgentError(code, message, { storyScoped: true, details })
}

/**
 * WordPress 401/403. Not retryable and stops publishing for the rest of the run:
 * every subsequent post would fail the same way, and hammering an auth endpoint
 * is how accounts get locked (§25).
 */
export function wordPressAuthError(message: string, details?: Record<string, unknown>): AgentError {
  return new AgentError('WORDPRESS_AUTH', message, { retryable: false, details })
}

export function isAgentError(value: unknown): value is AgentError {
  return value instanceof AgentError
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
