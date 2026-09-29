/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY LOCATION. Lives in server/src/llm/ until the shared/llm extraction
 * (ASSISTANT_ARCHITECTURE_PLAN.md §12, "Phase H — one adapter serving both
 * features") moves this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * xAI (Grok) provider adapter.
 *
 * The one real LLM behind the assistant. Everything xAI-specific — the wire
 * format, structured outputs, reasoning settings, status mapping, usage — lives
 * in this file and nowhere else. The engine, the routes, retrieval, grounding
 * and the React client cannot tell it from the mock: they see an LLMClient, and
 * the client sees an LLMProvider.
 *
 *   client.ts ── provider.complete(request) ──► THIS FILE ── POST /v1/responses ──► api.x.ai
 *        ▲                                                                              │
 *        └──────────────── { text, usage, model } ◄─────────────────────────────────────┘
 *
 * Its whole job is to turn the trusted prompt into a model response. It does
 * not validate the answer (client.ts, against AssistantReplySchema), does not
 * check tool ids (assistant/ground.ts), and does not decide what to do about a
 * failure beyond saying whether asking again could help.
 *
 * ── The API, and why raw fetch ───────────────────────────────────────────────
 *
 * The Responses API (`POST /v1/responses`) with `text.format.type =
 * "json_schema"` and `strict: true`: xAI constrains decoding to the schema and
 * documents the result as guaranteed to match it. That is the strongest
 * structured-output mechanism the API offers, and it is the same wire shape
 * the News Agent's OpenAI adapter already speaks, which keeps the eventual
 * shared/llm merge mechanical.
 *
 * No SDK. The adapter needs one POST; plain fetch covers it (CLAUDE.md,
 * Dependencies), and the `transport` seam keeps the whole file testable
 * offline — no test in this repository needs a key or a network.
 *
 * ── Exactly one HTTP request per complete() ──────────────────────────────────
 *
 * No retry loop here. client.ts already owns a bounded ladder
 * (LLM_RETRY.schemaAttempts) with budget accounting, and a second ladder in
 * the adapter would multiply the two — nine requests for one turn, most of
 * them invisible to the budget. Instead every failure is classified:
 *
 *   retryable       5xx, a dropped connection, an empty or truncated answer
 *   not retryable   401/403 credentials, 404 model, 400/422 request/context
 *                   length, 429 rate limit or quota, a timeout
 *
 * and client.ts stops at the first non-retryable one. A chat turn that is
 * going to fail should fail in one timeout, not three.
 *
 * ── Three contracts this file must not break ─────────────────────────────────
 *
 *   1. PROMPT INJECTION (§7). `request.system` becomes `instructions`;
 *      `request.input` — the wrapped user text — becomes `input`. Never merged.
 *
 *   2. SECRETS (§12). The key is read once into a closure and sent only as the
 *      Authorization header. It is never logged, never put into an error
 *      message or its details, and xAI's own message is never echoed for an
 *      auth failure, because vendors quote a masked fragment of the key back.
 *      env.ts has also registered it with the logger for redaction.
 *
 *   3. LOG HYGIENE. Per call: provider, model, duration, outcome, HTTP status,
 *      token counts. Never the prompt, the user's words or the model's answer.
 */

import { XAI_REQUEST } from '../../config/limits.ts'
import type { Logger } from '../../utils/logger.ts'
import { llmUnavailable, type LLMError } from '../errors.ts'
import {
  LLMRefusal,
  type LLMProvider,
  type LLMRawResponse,
  type LLMRequest,
  type LLMUsageDelta,
  type ModelClass,
} from '../provider.ts'
import { toXaiJsonSchema } from './xaiSchema.ts'

export const XAI_PROVIDER_ID = 'xai'

export const XAI_DEFAULT_BASE_URL = 'https://api.x.ai/v1'

/**
 * Used when LLM_MODEL_STRONG / LLM_MODEL_FAST are unset.
 *
 * `grok-4.7` is the model xAI's documentation recommends as the general-purpose
 * default, and it supports structured outputs. The assistant only uses the
 * `strong` class; `fast` is set to the same id so the contract stays total
 * rather than naming a second model nothing here exercises.
 */
export const XAI_DEFAULT_MODELS: Record<ModelClass, string> = {
  fast: 'grok-4.7',
  strong: 'grok-4.7',
}

/**
 * The models xAI documents as accepting `reasoning.effort` (Grok 4.5–4.7).
 *
 * Sending the field to a model that does not take it is a 400, so an unknown
 * or future id gets the model's own default rather than a guess.
 */
export function acceptsReasoningEffort(model: string): boolean {
  return /^grok-4\.[5-7](?![0-9])/i.test(model.trim())
}

/**
 * Whether the model spends output tokens on reasoning.
 *
 * Only an explicit `non-reasoning` id is known not to. Everything else is
 * given the reasoning allowance: over-allowing costs nothing unless tokens are
 * actually spent, while under-allowing truncates the JSON.
 */
export function spendsReasoningTokens(model: string): boolean {
  return !/non-reasoning/i.test(model)
}

export interface XaiProviderOptions {
  apiKey: string
  /** Empty string means "no override" — XAI_DEFAULT_MODELS is used. */
  modelFast: string
  modelStrong: string
  timeoutMs: number
  logger?: Logger
  /** Test seam. */
  transport?: typeof fetch
  baseUrl?: string
}

/* ── wire types ───────────────────────────────────────────────────────────── */

interface XaiUsage {
  input_tokens?: number
  output_tokens?: number
  output_tokens_details?: { reasoning_tokens?: number }
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

interface XaiErrorBody {
  code?: string
  error?: string | { message?: string; code?: string; type?: string }
}

/** What went wrong, in words an operator can grep a log for. */
type FailureCategory =
  | 'auth'
  | 'model_not_found'
  | 'bad_request'
  | 'context_length'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'server_error'
  | 'incomplete'
  | 'empty'
  | 'unreadable'
  | 'refusal'

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

/**
 * xAI's own error text, bounded and stripped of markup.
 *
 * Used for configuration failures only (unknown model, malformed request),
 * where the vendor's words are the actionable part. Never for 401/403.
 */
function errorDetail(text: string): string {
  if (!text) return ''
  try {
    const parsed = JSON.parse(text) as XaiErrorBody
    const nested = typeof parsed.error === 'object' ? parsed.error?.message : parsed.error
    if (nested) return nested.slice(0, 200)
  } catch {
    // Not JSON — fall through.
  }
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}

function looksLikeContextLength(detail: string): boolean {
  return /context|too long|maximum.*(token|length)|prompt.*length/i.test(detail)
}

function retryAfterSeconds(response: Response): number | undefined {
  const seconds = Number.parseFloat(response.headers.get('retry-after') ?? '')
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

/* ── provider ─────────────────────────────────────────────────────────────── */

export function createXaiProvider(options: XaiProviderOptions): LLMProvider {
  const transport = options.transport ?? fetch
  const baseUrl = (options.baseUrl ?? XAI_DEFAULT_BASE_URL).replace(/\/+$/, '')
  const log = options.logger?.child({ step: 'llm:provider', provider: XAI_PROVIDER_ID })

  const models: Record<ModelClass, string> = {
    fast: options.modelFast.trim() || XAI_DEFAULT_MODELS.fast,
    strong: options.modelStrong.trim() || XAI_DEFAULT_MODELS.strong,
  }

  // Read here and nowhere else. See contract 2 in the header.
  const authorization = `Bearer ${options.apiKey}`

  function buildBody(request: LLMRequest<unknown>, model: string): Record<string, unknown> {
    const allowance = spendsReasoningTokens(model) ? XAI_REQUEST.reasoningAllowanceTokens : 0
    return {
      model,
      // The privileged channel. Our instructions only (contract 1).
      instructions: request.system,
      // The user turn, carrying the wrapped untrusted text.
      input: request.input,
      max_output_tokens: request.maxOutputTokens + allowance,
      text: {
        format: {
          type: 'json_schema',
          name: safeSchemaName(request.schemaName),
          schema: toXaiJsonSchema(request.schema),
          strict: true,
        },
      },
      ...(acceptsReasoningEffort(model)
        ? { reasoning: { effort: XAI_REQUEST.reasoningEffort } }
        : {}),
      // Conversations are not worth leaving in a vendor's 30-day store, and
      // nothing here continues a response server-side: the transcript is ours.
      store: false,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    }
  }

  /** Builds the error client.ts will see. Message and details are key-free. */
  function failure(
    category: FailureCategory,
    message: string,
    retryable: boolean,
    details: Record<string, unknown> = {},
  ): LLMError {
    return llmUnavailable(`xAI: ${message}`, {
      retryable,
      details: { provider: XAI_PROVIDER_ID, category, ...details },
    })
  }

  function parse(body: XaiResponseBody, model: string): LLMRawResponse {
    const usage = usageFrom(body.usage)

    if (body.error?.message || body.error?.code) {
      throw failure('server_error', 'the response reported an error', true, {
        code: body.error.code,
        usage,
      })
    }

    // The model declining is not the request failing: client.ts handles the
    // two differently, and conflating them retries a model that will not comply.
    for (const item of body.output ?? []) {
      for (const part of item.content ?? []) {
        if (part.type === 'refusal' && part.refusal) {
          throw new LLMRefusal(part.refusal.slice(0, 300))
        }
      }
    }

    if (body.status === 'incomplete') {
      const reason = body.incomplete_details?.reason ?? 'unknown'
      if (reason === 'content_filter') throw new LLMRefusal('xAI content filter stopped the response')
      throw failure(
        'incomplete',
        `the response was cut short (reason: ${reason})` +
          (reason === 'max_output_tokens'
            ? '. The output ceiling (TASK_MAX_OUTPUT_TOKENS + XAI_REQUEST.reasoningAllowanceTokens) was reached before the JSON closed.'
            : ''),
        true,
        { reason, usage },
      )
    }

    // Reasoning items carry no answer text; only the message's output_text does.
    const text = (body.output ?? [])
      .filter((item) => item.type === undefined || item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('')

    if (!text) {
      throw failure('empty', 'the response contained no output text', true, {
        status: body.status ?? 'unknown',
        usage,
      })
    }

    // Handed through untouched. Parsing and validation are client.ts's job, so
    // a malformed answer gets the same repair path from every provider.
    return { text, usage, model: body.model ?? model }
  }

  async function request(
    body: Record<string, unknown>,
    model: string,
  ): Promise<{ raw: LLMRawResponse; status: number; reasoningTokens: number }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)

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
      const aborted = cause instanceof Error && cause.name === 'AbortError'
      // Deliberately not chained as `cause`: a fetch error can carry request
      // internals, and nothing downstream needs more than the category.
      if (aborted) {
        throw failure('timeout', `no response within ${options.timeoutMs}ms (LLM_TIMEOUT_MS)`, false)
      }
      throw failure('network', 'could not reach the API', true)
    } finally {
      clearTimeout(timer)
    }

    const status = response.status

    if (status === 401 || status === 403) {
      // xAI's message is NOT read: see contract 2.
      throw failure(
        'auth',
        `the API rejected the credentials (HTTP ${status}). Check LLM_API_KEY.`,
        false,
        { status },
      )
    }

    if (status === 429) {
      const seconds = retryAfterSeconds(response)
      const detail = errorDetail(await safeText(response))
      throw failure('rate_limited', `rate limited or out of credit (HTTP 429). ${detail}`, false, {
        status,
        ...(seconds !== undefined ? { retryAfterSeconds: seconds } : {}),
      })
    }

    if (status === 408 || status >= 500) {
      throw failure('server_error', `the API responded ${status}`, true, { status })
    }

    if (!response.ok) {
      const detail = errorDetail(await safeText(response))
      if (status === 404) {
        throw failure(
          'model_not_found',
          `model "${model}" was not found or is not available to this key (HTTP 404). ` +
            `Check LLM_MODEL_STRONG. ${detail}`,
          false,
          { status },
        )
      }
      const category: FailureCategory = looksLikeContextLength(detail) ? 'context_length' : 'bad_request'
      throw failure(category, `the API rejected the request (HTTP ${status}). ${detail}`, false, {
        status,
      })
    }

    let parsed: XaiResponseBody
    try {
      parsed = (await response.json()) as XaiResponseBody
    } catch {
      throw failure('unreadable', 'the response body was not readable JSON', true, { status })
    }

    return {
      raw: parse(parsed, model),
      status,
      reasoningTokens: Math.max(0, Math.trunc(parsed.usage?.output_tokens_details?.reasoning_tokens ?? 0)),
    }
  }

  return {
    id: XAI_PROVIDER_ID,

    modelFor(modelClass) {
      return models[modelClass]
    },

    async complete(llmRequest) {
      const model = models[llmRequest.modelClass]
      const started = Date.now()

      try {
        const { raw, status, reasoningTokens } = await request(buildBody(llmRequest, model), model)
        log?.info('Provider call succeeded', {
          model: raw.model,
          durationMs: Date.now() - started,
          status,
          inputTokens: raw.usage.inputTokens,
          outputTokens: raw.usage.outputTokens,
          reasoningTokens,
        })
        return raw
      } catch (error) {
        const refusal = error instanceof LLMRefusal
        const details = refusal ? {} : ((error as LLMError).details ?? {})
        log?.warn('Provider call failed', {
          model,
          durationMs: Date.now() - started,
          category: refusal ? 'refusal' : details.category,
          ...(details.status !== undefined ? { status: details.status } : {}),
          retryable: refusal ? true : (error as LLMError).retryable,
        })
        throw error
      }
    },
  }
}
