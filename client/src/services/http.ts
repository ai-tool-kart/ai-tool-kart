/*
 * The AI Tool Kart API client's shared plumbing.
 *
 * One place that knows the base URL, one place that turns a failed request into
 * an error a person can read. Every service module (assistant, taxonomy, and
 * the catalogue when it migrates) goes through `apiRequest`; none of them
 * repeats fetch/JSON/error handling.
 *
 * ── Why the base URL has a default ───────────────────────────────────────────
 *
 * services/wordpress.ts throws when its env var is missing, correctly: there is
 * no sensible default for someone else's CMS host. Our own API is different —
 * `server/.env.example` fixes the dev port at 3001 and the server runs with no
 * configuration at all, so the default below is the documented development
 * setup rather than a guess. Deployments override it with VITE_API_URL.
 */

const DEFAULT_API_BASE = 'http://localhost:3001/api'

export const API_BASE: string = (
  import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE
).replace(/\/$/, '')

/**
 * A failed API call.
 *
 * `code` is the server's error vocabulary (`INVALID_REQUEST`,
 * `ASSISTANT_UNAVAILABLE`, `PROVIDER_UNAVAILABLE`, `NOT_FOUND`, `INTERNAL`) or
 * `NETWORK` when the request never reached it. `message` is always safe to show
 * a reader: the server writes its 4xx/5xx messages for exactly that, and the
 * network case is written here.
 */
interface ApiRequestErrorOptions extends ErrorOptions {
  /** Per-field messages from a VALIDATION_FAILED body, keyed by field name. */
  fields?: Record<string, string>
  /** Parsed from a `Retry-After` response header, if the server sent one. */
  retryAfterSeconds?: number
}

export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number
  readonly fields?: Record<string, string>
  readonly retryAfterSeconds?: number

  constructor(message: string, code: string, status: number, options?: ApiRequestErrorOptions) {
    super(message, options)
    this.name = 'ApiRequestError'
    this.code = code
    this.status = status
    this.fields = options?.fields
    this.retryAfterSeconds = options?.retryAfterSeconds
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.code === 'NETWORK' || this.status >= 500 || this.status === 422
  }
}

/** The server's error envelope: `{ error: { code, message, details?, fields? } }`. */
interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown; fields?: unknown }
}

/** Narrows an unknown `fields` value to a string-to-string map, dropping anything else. */
function fieldsFrom(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

async function errorFrom(response: Response): Promise<ApiRequestError> {
  let code = 'INTERNAL'
  let message = `The server responded ${response.status}.`
  let fields: Record<string, string> | undefined

  try {
    const body = (await response.json()) as ErrorEnvelope
    if (typeof body.error?.code === 'string') code = body.error.code
    if (typeof body.error?.message === 'string') message = body.error.message
    fields = fieldsFrom(body.error?.fields)
  } catch {
    // A non-JSON error body (a proxy's HTML 502, say). The status-derived
    // message above is already the best thing we can show.
  }

  // Present on RATE_LIMITED today (http/middleware/rateLimit.ts); a generic
  // read so any future error carrying it is picked up the same way.
  const retryAfterHeader = Number(response.headers.get('Retry-After'))
  const retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined

  return new ApiRequestError(message, code, response.status, { fields, retryAfterSeconds })
}

export interface ApiRequestOptions {
  signal?: AbortSignal
  /** Present for POST/PUT; absent for GET. Serialised as JSON. */
  body?: unknown
}

/**
 * Performs one API call and returns its parsed JSON body.
 *
 * Throws `ApiRequestError` for every failure except an abort, which rethrows the
 * original `AbortError` so callers can tell "cancelled" from "failed".
 */
export async function apiRequest<T>(
  path: string,
  { signal, body }: ApiRequestOptions = {},
): Promise<T> {
  const init: RequestInit = { signal }
  if (body !== undefined) {
    init.method = 'POST'
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, init)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiRequestError(
      `Could not reach the AI Tool Kart API at ${API_BASE}. Is the server running?`,
      'NETWORK',
      0,
      { cause },
    )
  }

  if (!response.ok) throw await errorFrom(response)

  try {
    return (await response.json()) as T
  } catch (cause) {
    throw new ApiRequestError(
      'The server returned a response this app could not read.',
      'INTERNAL',
      response.status,
      { cause },
    )
  }
}
