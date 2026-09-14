/*
 * OpenAI provider adapter (NEWS_AGENT.md §12).
 *
 * The first real adapter behind the LLMProvider abstraction. Everything
 * OpenAI-specific — the Responses API wire format, Structured Outputs, HTTP
 * status mapping, usage reporting — lives in this file and nowhere else. No
 * pipeline module imports it; they call the shared client, which calls this
 * through the interface.
 *
 * ── Why the Responses API, and why raw fetch ──────────────────────────────────
 *
 * Responses is the current structured-output path: `text.format` takes a JSON
 * Schema with `strict: true`, and the model is constrained at decode time to
 * emit conforming JSON. That removes the whole class of failures the old
 * JSON-mode path had — prose preambles, markdown fences, truncated objects
 * recovered by regex. The shared recovery code in client.ts stays, because it
 * serves every provider, but on this path it is defence in depth rather than
 * the mechanism.
 *
 * There is no `openai` package dependency. The adapter needs one POST, and the
 * repository's dependency policy (CLAUDE.md) says not to add a package for
 * functionality that plain fetch already covers. A `transport` seam keeps it
 * fully testable offline.
 *
 * ── Two contracts this file must not break ────────────────────────────────────
 *
 *   1. PROMPT INJECTION (§28). `request.system` becomes `instructions`;
 *      `request.input` — which carries untrusted source text — becomes the user
 *      turn. They are never concatenated. Nothing source-derived ever reaches
 *      the instruction channel.
 *
 *   2. SECRETS (§28). The API key is read once into a closure, sent only as an
 *      Authorization header, and never logged, never put into an error message,
 *      and never echoed back in a details object. Error text is built from the
 *      status code and OpenAI's own message field, both of which are
 *      key-free — and the request body is never included in a thrown error.
 */

import { RETRY } from '../../config/limits.ts'
import { AgentError } from '../../domain/errors.ts'
import { sleep } from '../../utils/time.ts'
import { toStrictJsonSchema } from './openaiSchema.ts'
import {
  LLMRefusal,
  type LLMProvider,
  type LLMRawResponse,
  type LLMRequest,
  type LLMUsageDelta,
  type ModelClass,
} from '../provider.ts'

/**
 * Adapter-local model defaults, used when LLM_MODEL_FAST / LLM_MODEL_STRONG are
 * unset. Deliberately NOT reasoning models.
 *
 * TASK_MAX_OUTPUT_TOKENS (config/limits.ts) budgets output tokens for the answer
 * — 512 for classification. On a reasoning model that same ceiling also has to
 * cover hidden reasoning tokens, so a tight cap produces truncated responses
 * rather than cheap ones. The gpt-4.1 pair gives the fast/strong split the
 * pipeline expects with token accounting that means what the limits assume.
 *
 * Override either with the env vars; nothing here is hardcoded into a prompt or
 * into pipeline logic.
 */
export const OPENAI_DEFAULT_MODELS: Record<ModelClass, string> = {
  fast: 'gpt-4.1-mini',
  strong: 'gpt-4.1',
}

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export interface OpenAIProviderOptions {
  apiKey: string
  /** Empty string means "no override" — the adapter default is used. */
  modelFast: string
  modelStrong: string
  timeoutMs: number
  /** Test seam. */
  transport?: typeof fetch
  baseUrl?: string
  /** Test seam so backoff does not slow the suite. */
  sleepFn?: (ms: number) => Promise<void>
  /** Transport-level attempts for transient failures. */
  attempts?: number
}

/* ── wire types ───────────────────────────────────────────────────────────── */

interface OpenAIUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

interface OpenAIContentPart {
  type?: string
  text?: string
  refusal?: string
}

interface OpenAIOutputItem {
  type?: string
  content?: OpenAIContentPart[]
}

interface OpenAIResponseBody {
  status?: string
  model?: string
  incomplete_details?: { reason?: string }
  error?: { code?: string; message?: string } | null
  output?: OpenAIOutputItem[]
  output_text?: string
  usage?: OpenAIUsage
}

interface OpenAIErrorBody {
  error?: { message?: string; type?: string; code?: string }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

/**
 * Reasoning models reject `temperature` outright (HTTP 400). The pipeline asks
 * for temperature 0 on several tasks, so an operator who overrides
 * LLM_MODEL_STRONG with a reasoning model would otherwise get a hard failure on
 * every call. Dropping the parameter is the correct behaviour: those models are
 * deterministic-ish by design and have no temperature control to set.
 */
export function supportsTemperature(model: string): boolean {
  return !/^(o\d|gpt-5|gpt-6)/i.test(model.trim())
}

function usageFrom(usage: OpenAIUsage | undefined): LLMUsageDelta {
  return {
    inputTokens: Math.max(0, Math.trunc(usage?.input_tokens ?? 0)),
    outputTokens: Math.max(0, Math.trunc(usage?.output_tokens ?? 0)),
  }
}

/** json_schema names are restricted to [a-zA-Z0-9_-]. */
function safeSchemaName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
  return cleaned.length > 0 ? cleaned : 'Response'
}

/**
 * Removes null-valued properties, recursively.
 *
 * Strict Structured Outputs requires every property to be listed in `required`,
 * so genuinely optional fields are encoded as `anyOf: [T, {type: "null"}]` (see
 * openaiSchema.ts) and the model returns `null` for the ones it omits. None of
 * the pipeline's schemas has a field that legitimately accepts null — an absent
 * value is spelled `.optional()` in zod — so a null here means exactly "not
 * present", and dropping the key restores the shape zod expects.
 *
 * This is a decoding step for an encoding this adapter chose. It does not
 * relax validation: the result still goes through the task's zod schema in
 * client.ts, unchanged.
 */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls)
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null) continue
    out[key] = stripNulls(entry)
  }
  return out
}

/* ── error mapping (§8 of the milestone brief) ────────────────────────────── */

/**
 * Authentication failure.
 *
 * CONFIG is fatal by construction, and that is the right severity: a rejected
 * key fails identically for every story, so continuing would mean one doomed
 * API call per candidate and, on a 401, a run's worth of failed-auth attempts
 * against the provider. It is never retried.
 */
function authError(status: number, detail: string): AgentError {
  return new AgentError(
    'CONFIG',
    `OpenAI rejected the credentials (HTTP ${status}). ${detail} ` +
      'Check LLM_API_KEY in the agent environment — the key itself is never logged. ' +
      'Set LLM_PROVIDER=mock to run offline.',
    { fatal: true, retryable: false, details: { status } },
  )
}

function providerError(
  message: string,
  options: { retryable: boolean; usage?: LLMUsageDelta; details?: Record<string, unknown> },
): AgentError {
  return new AgentError('LLM_UNAVAILABLE', message, {
    retryable: options.retryable,
    storyScoped: true,
    details: {
      ...options.details,
      ...(options.usage ? { usage: options.usage } : {}),
    },
  })
}

/**
 * HTTP 429 codes that are NOT rate limiting.
 *
 * OpenAI returns 429 both for "you are going too fast" and for "your account
 * cannot pay for this". They need opposite handling: the first clears on its own
 * and deserves a backoff, the second never clears without an operator topping up
 * the balance, so retrying it just burns the retry ladder — and then does it
 * again for every remaining story in the run.
 */
const NON_TRANSIENT_429_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'billing_hard_limit_reached',
  'account_deactivated',
])

/** Reads the machine-readable error code from an error body, if present. */
function errorCode(text: string): string | undefined {
  if (!text) return undefined
  try {
    return (JSON.parse(text) as OpenAIErrorBody).error?.code ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Billing / quota failure.
 *
 * Fatal for the same reason a rejected credential is: it fails identically for
 * every story, so continuing would mean one doomed call per candidate. Stopping
 * the run with an actionable message is the honest outcome.
 */
function billingError(code: string, detail: string): AgentError {
  return new AgentError(
    'CONFIG',
    `OpenAI refused the request for billing reasons [${code}]. ${detail} ` +
      'This is not a transient rate limit and is not retried. Add credit to the account, ' +
      'or set LLM_PROVIDER=mock to run the pipeline offline.',
    { fatal: true, retryable: false, details: { status: 429, code } },
  )
}

/** Extracts OpenAI's own error message without echoing an entire HTML page. */
function errorDetail(status: number, text: string): string {
  if (!text) return `(no response body, HTTP ${status})`
  try {
    const parsed = JSON.parse(text) as OpenAIErrorBody
    if (parsed.error?.message) {
      return `${parsed.error.code ? `[${parsed.error.code}] ` : ''}${parsed.error.message}`.slice(0, 300)
    }
  } catch {
    // Not JSON — fall through to truncated text.
  }
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Retry-After, in ms, clamped so a hostile or mistaken header cannot stall a run. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number.parseFloat(header)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.min(seconds * 1000, RETRY.httpMaxDelayMs)
}

/* ── provider ─────────────────────────────────────────────────────────────── */

export function createOpenAIProvider(options: OpenAIProviderOptions): LLMProvider {
  const transport = options.transport ?? fetch
  const pause = options.sleepFn ?? sleep
  const baseUrl = (options.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, '')
  const attempts = options.attempts ?? RETRY.httpAttempts

  const models: Record<ModelClass, string> = {
    fast: options.modelFast.trim() || OPENAI_DEFAULT_MODELS.fast,
    strong: options.modelStrong.trim() || OPENAI_DEFAULT_MODELS.strong,
  }

  /*
   * The key is captured here and read nowhere else. It is interpolated into the
   * Authorization header only, never into a log line, a message, or an error's
   * details.
   */
  const authorization = `Bearer ${options.apiKey}`

  function buildBody(request: LLMRequest<unknown>, model: string): Record<string, unknown> {
    return {
      model,
      /*
       * `instructions` is the privileged channel; `input` is the user turn.
       * Untrusted source text is in request.input and must stay there (§28).
       */
      instructions: request.system,
      input: request.input,
      max_output_tokens: request.maxOutputTokens,
      text: {
        format: {
          type: 'json_schema',
          name: safeSchemaName(request.schemaName),
          strict: true,
          schema: toStrictJsonSchema(request.schema),
        },
      },
      // Nothing the pipeline sends needs to persist on the provider side, and
      // source text plus our prompts are not worth leaving in a vendor store.
      store: false,
      ...(request.temperature !== undefined && supportsTemperature(model)
        ? { temperature: request.temperature }
        : {}),
    }
  }

  function parse(body: OpenAIResponseBody, model: string): LLMRawResponse {
    const usage = usageFrom(body.usage)

    if (body.error?.message) {
      throw providerError(`OpenAI reported an error: ${body.error.message.slice(0, 300)}`, {
        retryable: false,
        usage,
        details: { code: body.error.code },
      })
    }

    // A refusal is the model declining, not the request failing. Surface it as
    // such so the client can treat it separately from an outage.
    for (const item of body.output ?? []) {
      for (const part of item.content ?? []) {
        if (part.type === 'refusal' && part.refusal) {
          throw new LLMRefusal(part.refusal.slice(0, 300), usage)
        }
      }
    }

    const text = (body.output ?? [])
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('')

    if (body.status === 'incomplete') {
      const reason = body.incomplete_details?.reason ?? 'unknown'
      throw providerError(
        `OpenAI returned an incomplete response (reason: ${reason}). ` +
          (reason === 'max_output_tokens'
            ? 'The task output ceiling in config/limits.ts was reached before the JSON closed.'
            : 'The response was cut short before the JSON closed.'),
        { retryable: reason !== 'content_filter', usage, details: { reason } },
      )
    }

    if (!text) {
      throw providerError('OpenAI returned no output text', {
        retryable: true,
        usage,
        details: { status: body.status ?? 'unknown' },
      })
    }

    /*
     * Strict Structured Outputs guarantees parseable JSON, so this is the one
     * place the adapter touches the payload: re-encoding after dropping the
     * nulls that stand in for absent optional fields. If the text somehow is not
     * JSON, it is handed through untouched and client.ts reports it as a schema
     * failure with the usual repair retry.
     */
    let decoded = text
    try {
      decoded = JSON.stringify(stripNulls(JSON.parse(text)))
    } catch {
      // Leave `text` as-is; the shared validation layer owns this failure.
    }

    return { text: decoded, usage, model: body.model ?? model }
  }

  return {
    id: 'openai',

    modelFor(modelClass) {
      return models[modelClass]
    },

    async complete(request) {
      const model = models[request.modelClass]
      const body = buildBody(request, model)
      let lastError: unknown

      /*
       * Transport-level retries only: a 429 or a 502 produced no completion and
       * no tokens, so retrying here cannot bypass the run budget. Every response
       * that DID cost tokens reports usage — including the failures — and
       * client.ts records it against the budget before deciding what to do.
       */
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), options.timeoutMs)

        let response: Response
        try {
          response = await transport(`${baseUrl}/responses`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              // Never logged. See the secrets note at the top of this file.
              authorization,
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify(body),
          })
        } catch (cause) {
          const aborted = cause instanceof Error && cause.name === 'AbortError'
          lastError = providerError(
            aborted
              ? `OpenAI request timed out after ${options.timeoutMs}ms`
              : 'Could not reach the OpenAI API',
            { retryable: true },
          )
          if (attempt < attempts) {
            await pause(Math.min(RETRY.httpBaseDelayMs * 2 ** (attempt - 1), RETRY.httpMaxDelayMs))
            continue
          }
          throw lastError
        } finally {
          clearTimeout(timer)
        }

        if (response.status === 401 || response.status === 403) {
          throw authError(response.status, errorDetail(response.status, await safeText(response)))
        }

        if (response.status === 429 || response.status === 408 || response.status >= 500) {
          const bodyText = await safeText(response)
          const detail = errorDetail(response.status, bodyText)

          if (response.status === 429) {
            const code = errorCode(bodyText)
            if (code && NON_TRANSIENT_429_CODES.has(code)) throw billingError(code, detail)
          }

          lastError = providerError(`OpenAI responded ${response.status}. ${detail}`, {
            retryable: true,
            details: { status: response.status },
          })
          if (attempt < attempts) {
            const backoff =
              retryAfterMs(response) ??
              Math.min(RETRY.httpBaseDelayMs * 2 ** (attempt - 1), RETRY.httpMaxDelayMs)
            await pause(backoff)
            continue
          }
          throw lastError
        }

        if (!response.ok) {
          const detail = errorDetail(response.status, await safeText(response))
          throw providerError(
            `OpenAI rejected the request (HTTP ${response.status}). ${detail}` +
              (response.status === 404
                ? ' Check LLM_MODEL_FAST / LLM_MODEL_STRONG — the model may not exist or may not be available to this account.'
                : ''),
            { retryable: false, details: { status: response.status } },
          )
        }

        let parsed: OpenAIResponseBody
        try {
          parsed = (await response.json()) as OpenAIResponseBody
        } catch (cause) {
          throw providerError('OpenAI returned an unreadable response body', {
            retryable: false,
            details: { cause: String(cause).slice(0, 200) },
          })
        }

        return parse(parsed, model)
      }

      throw lastError ?? providerError('OpenAI request exhausted attempts', { retryable: false })
    },
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
