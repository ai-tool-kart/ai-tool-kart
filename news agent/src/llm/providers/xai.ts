/*
 * xAI (Grok) provider adapter (NEWS_AGENT.md §12).
 *
 * Selected with LLM_PROVIDER=xai. Credentials come from XAI_API_KEY and the
 * model from XAI_MODEL — see config/env.ts. Everything xAI-specific lives in
 * this file; no pipeline module imports it.
 *
 * ── Wire format ──────────────────────────────────────────────────────────────
 *
 * xAI's OpenAI-compatible Responses API (`POST https://api.x.ai/v1/responses`)
 * — the same request shape the OpenAI adapter sends — with `text.format` set to
 * a strict `json_schema`. xAI documents strict mode as decode-time enforced for
 * the Grok 4 family, and its accepted subset is a superset of OpenAI's: every
 * property required, `additionalProperties: false` and nullable `anyOf`
 * branches are all valid. So the schema goes through the same
 * toStrictJsonSchema() and the response through the same stripNulls() as on
 * OpenAI, and client.ts validates against the unmodified zod schema exactly as
 * before. Structured-output behaviour is identical across the two providers.
 *
 * Two differences from OpenAI that the request has to account for:
 *
 *   - Grok 4.x models reason, and `max_output_tokens` covers reasoning plus
 *     answer. XAI_REQUEST.reasoningAllowanceTokens is added on top of the task
 *     ceiling so hidden reasoning cannot truncate the JSON.
 *   - `reasoning.effort` is only accepted by Grok 4.5–4.7; anything else gets
 *     the model's own default rather than a 400.
 *
 * No SDK and no `openai` package — one POST via fetch, same as the OpenAI
 * adapter, with a `transport` seam so every test runs offline.
 *
 * ── Contracts this file must not break ───────────────────────────────────────
 *
 *   1. PROMPT INJECTION (§28). `request.system` becomes `instructions`;
 *      `request.input` — untrusted source text — becomes `input`. Never merged.
 *
 *   2. SECRETS (§28). The key is read once into a closure and sent only as the
 *      Authorization header. It never reaches a log line, an error message or
 *      an error's details. xAI's own message is NOT echoed for 401/403, because
 *      vendors quote a masked fragment of the key back.
 *
 *   3. ATTRIBUTION. Every error this file throws says "xAI" in its message and
 *      carries `details.provider = 'xai'`, so a provider failure in the run log
 *      cannot be confused with a WORDPRESS or SOURCE_FETCH failure.
 */

import { RETRY, XAI_REQUEST } from '../../config/limits.ts'
import { AgentError, configError } from '../../domain/errors.ts'
import { sleep } from '../../utils/time.ts'
import { stripNulls } from './openai.ts'
import { toStrictJsonSchema } from './openaiSchema.ts'
import {
  LLMRefusal,
  type LLMProvider,
  type LLMRawResponse,
  type LLMRequest,
  type LLMUsageDelta,
  type ModelClass,
} from '../provider.ts'

export const XAI_PROVIDER_ID = 'xai'

export const XAI_DEFAULT_BASE_URL = 'https://api.x.ai/v1'

/** The models xAI documents as accepting `reasoning.effort` (Grok 4.5–4.7). */
export function acceptsReasoningEffort(model: string): boolean {
  return /^grok-4\.[5-7](?![0-9])/i.test(model.trim())
}

/**
 * Whether the model spends output tokens on reasoning. Only an explicit
 * `non-reasoning` id is known not to; over-allowing costs nothing unless the
 * tokens are actually spent, while under-allowing truncates the JSON.
 */
export function spendsReasoningTokens(model: string): boolean {
  return !/non-reasoning/i.test(model)
}

export interface XaiProviderOptions {
  apiKey: string
  /** From XAI_MODEL. One model serves both classes unless they differ. */
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

interface XaiUsage {
  input_tokens?: number
  output_tokens?: number
}

interface XaiContentPart {
  type?: string
  text?: string
  refusal?: string
}

interface XaiOutputItem {
  type?: string
  content?: XaiContentPart[]
}

interface XaiResponseBody {
  status?: string
  model?: string
  incomplete_details?: { reason?: string } | null
  error?: { code?: string; message?: string } | null
  output?: XaiOutputItem[]
  usage?: XaiUsage
}

/** xAI uses both `{code, error: "text"}` and the OpenAI `{error: {message}}` shape. */
interface XaiErrorBody {
  code?: string
  error?: string | { message?: string; code?: string; type?: string }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function usageFrom(usage: XaiUsage | undefined): LLMUsageDelta {
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

/** xAI's own error text, bounded and stripped of markup. Never used for 401/403. */
function errorDetail(status: number, text: string): string {
  if (!text) return `(no response body, HTTP ${status})`
  try {
    const parsed = JSON.parse(text) as XaiErrorBody
    const message = typeof parsed.error === 'object' ? parsed.error?.message : parsed.error
    if (message) return message.slice(0, 300)
  } catch {
    // Not JSON — fall through to truncated text.
  }
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}

/**
 * A 429 that will not clear by waiting: out of credits or over a spending
 * limit. Retrying it burns the ladder and then does it again for every
 * remaining story, so it is fatal, like the OpenAI adapter's billing case.
 */
function isBillingFailure(detail: string): boolean {
  return /credit|spending limit|billing|quota|exhausted|payment/i.test(detail)
}

/** Retry-After, in ms, clamped so a hostile or mistaken header cannot stall a run. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number.parseFloat(header)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.min(seconds * 1000, RETRY.httpMaxDelayMs)
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

/* ── error mapping ────────────────────────────────────────────────────────── */

/**
 * Credentials, permissions or an unfunded team. Fatal: it fails identically
 * for every story. xAI answers 403 both for a bad key and for a team with no
 * credits, so the message names both.
 */
function authError(status: number): AgentError {
  return new AgentError(
    'CONFIG',
    `xAI rejected the request (HTTP ${status}): the API key is invalid, lacks permission, ` +
      'or its team has no credits. Check XAI_API_KEY and the team balance at console.x.ai — ' +
      'the key itself is never logged. Set LLM_PROVIDER=mock to run offline.',
    { fatal: true, retryable: false, details: { provider: XAI_PROVIDER_ID, status } },
  )
}

function billingError(detail: string): AgentError {
  return new AgentError(
    'CONFIG',
    `xAI refused the request for billing reasons (HTTP 429). ${detail} ` +
      'This is not a transient rate limit and is not retried. Add credit or raise the ' +
      'spending limit at console.x.ai, or set LLM_PROVIDER=mock to run the pipeline offline.',
    { fatal: true, retryable: false, details: { provider: XAI_PROVIDER_ID, status: 429 } },
  )
}

function providerError(
  message: string,
  options: { retryable: boolean; usage?: LLMUsageDelta; details?: Record<string, unknown> },
): AgentError {
  return new AgentError('LLM_UNAVAILABLE', `xAI: ${message}`, {
    retryable: options.retryable,
    storyScoped: true,
    details: {
      provider: XAI_PROVIDER_ID,
      ...options.details,
      ...(options.usage ? { usage: options.usage } : {}),
    },
  })
}

/* ── provider ─────────────────────────────────────────────────────────────── */

export function createXaiProvider(options: XaiProviderOptions): LLMProvider {
  const transport = options.transport ?? fetch
  const pause = options.sleepFn ?? sleep
  const baseUrl = (options.baseUrl ?? XAI_DEFAULT_BASE_URL).replace(/\/+$/, '')
  const attempts = options.attempts ?? RETRY.httpAttempts

  const fallback = options.modelStrong.trim() || options.modelFast.trim()
  if (!fallback) {
    throw configError(
      'XAI_MODEL is not configured. Set it to an xAI model id (e.g. XAI_MODEL=grok-4.7) ' +
        'in the agent environment, or use LLM_PROVIDER=mock to run offline.',
    )
  }
  const models: Record<ModelClass, string> = {
    fast: options.modelFast.trim() || fallback,
    strong: options.modelStrong.trim() || fallback,
  }

  // Read here and nowhere else. See contract 2 in the header.
  const authorization = `Bearer ${options.apiKey}`

  function buildBody(request: LLMRequest<unknown>, model: string): Record<string, unknown> {
    const allowance = spendsReasoningTokens(model) ? XAI_REQUEST.reasoningAllowanceTokens : 0
    return {
      model,
      // The privileged channel; untrusted source text stays in `input` (§28).
      instructions: request.system,
      input: request.input,
      max_output_tokens: request.maxOutputTokens + allowance,
      text: {
        format: {
          type: 'json_schema',
          name: safeSchemaName(request.schemaName),
          strict: true,
          schema: toStrictJsonSchema(request.schema),
        },
      },
      ...(acceptsReasoningEffort(model)
        ? { reasoning: { effort: XAI_REQUEST.reasoningEffort } }
        : {}),
      // Source text plus our prompts are not worth leaving in a vendor store.
      store: false,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    }
  }

  function parse(body: XaiResponseBody, model: string): LLMRawResponse {
    const usage = usageFrom(body.usage)

    if (body.error?.message || body.error?.code) {
      throw providerError(
        `the response reported an error: ${(body.error.message ?? body.error.code ?? '').slice(0, 300)}`,
        { retryable: false, usage, details: { code: body.error.code } },
      )
    }

    // A refusal is the model declining, not the request failing.
    for (const item of body.output ?? []) {
      for (const part of item.content ?? []) {
        if (part.type === 'refusal' && part.refusal) {
          throw new LLMRefusal(part.refusal.slice(0, 300), usage)
        }
      }
    }

    if (body.status === 'incomplete') {
      const reason = body.incomplete_details?.reason ?? 'unknown'
      if (reason === 'content_filter') {
        throw new LLMRefusal('xAI content filter stopped the response', usage)
      }
      throw providerError(
        `the response was cut short (reason: ${reason})` +
          (reason === 'max_output_tokens'
            ? '. The output ceiling (TASK_MAX_OUTPUT_TOKENS + XAI_REQUEST.reasoningAllowanceTokens) was reached before the JSON closed.'
            : ''),
        { retryable: true, usage, details: { reason } },
      )
    }

    // Reasoning items carry no answer text; only message output_text does.
    const text = (body.output ?? [])
      .filter((item) => item.type === undefined || item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('')

    if (!text) {
      throw providerError('the response contained no output text', {
        retryable: true,
        usage,
        details: { status: body.status ?? 'unknown' },
      })
    }

    // Same decoding step as the OpenAI adapter: nulls stand in for absent
    // optional fields under the strict schema. Non-JSON is handed through for
    // client.ts to report as a schema failure with the usual repair retry.
    let decoded = text
    try {
      decoded = JSON.stringify(stripNulls(JSON.parse(text)))
    } catch {
      // Leave `text` as-is.
    }

    return { text: decoded, usage, model: body.model ?? model }
  }

  return {
    id: XAI_PROVIDER_ID,

    modelFor(modelClass) {
      return models[modelClass]
    },

    async complete(request) {
      const model = models[request.modelClass]
      const body = buildBody(request, model)
      let lastError: unknown

      /*
       * Transport-level retries only, as in the OpenAI adapter: a 429 or a 502
       * produced no completion and no tokens, so retrying here cannot bypass the
       * run budget.
       */
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), options.timeoutMs)
        const backoff = Math.min(RETRY.httpBaseDelayMs * 2 ** (attempt - 1), RETRY.httpMaxDelayMs)

        let response: Response
        try {
          response = await transport(`${baseUrl}/responses`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              authorization,
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify(body),
          })
        } catch (cause) {
          // Not chained as `cause`: a fetch error can carry request internals.
          const aborted = cause instanceof Error && cause.name === 'AbortError'
          lastError = providerError(
            aborted
              ? `request timed out after ${options.timeoutMs}ms (AGENT_HTTP_TIMEOUT_MS)`
              : 'could not reach the API',
            { retryable: true, details: { category: aborted ? 'timeout' : 'network' } },
          )
          if (attempt < attempts) {
            await pause(backoff)
            continue
          }
          throw lastError
        } finally {
          clearTimeout(timer)
        }

        const status = response.status

        if (status === 401 || status === 403) {
          // xAI's message is NOT read: see contract 2.
          await safeText(response)
          throw authError(status)
        }

        if (status === 429 || status === 408 || status >= 500) {
          const detail = errorDetail(status, await safeText(response))
          if (status === 429 && isBillingFailure(detail)) throw billingError(detail)

          lastError = providerError(`the API responded ${status}. ${detail}`, {
            retryable: true,
            details: { status },
          })
          if (attempt < attempts) {
            await pause(retryAfterMs(response) ?? backoff)
            continue
          }
          throw lastError
        }

        if (!response.ok) {
          const detail = errorDetail(status, await safeText(response))
          // Observed live: xAI answers an invalid key with HTTP 400 ("Incorrect
          // API key provided"), not 401. It fails identically for every story,
          // so it gets the same fatal treatment — and the same key-free message.
          if (status === 400 && /api key/i.test(detail)) throw authError(status)
          throw providerError(
            `the API rejected the request (HTTP ${status}). ${detail}` +
              (status === 404
                ? ` Check XAI_MODEL — "${model}" may not exist or may not be available to this key.`
                : ''),
            { retryable: false, details: { status } },
          )
        }

        let parsed: XaiResponseBody
        try {
          parsed = (await response.json()) as XaiResponseBody
        } catch {
          throw providerError('the response body was not readable JSON', {
            retryable: false,
            details: { status },
          })
        }

        return parse(parsed, model)
      }

      throw lastError ?? providerError('request exhausted attempts', { retryable: false })
    },
  }
}
