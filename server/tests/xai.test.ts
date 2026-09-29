/*
 * xAI (Grok) provider adapter tests.
 *
 * Every case is offline. The adapter takes a `transport` seam, so the suite
 * never needs LLM_API_KEY and never reaches api.x.ai. The two end-to-end cases
 * at the bottom drive the REAL engine, grounding and HTTP route with only the
 * vendor's network edge replaced, which is the one place a fake is honest.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssistantEngine } from '../src/assistant/engine.ts'
import { ASSISTANT_SCHEMA_NAME, AssistantReplySchema } from '../src/assistant/schema.ts'
import { createAutomationMatcher } from '../src/automations/match.ts'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import { loadEnv } from '../src/config/env.ts'
import { API_BASE_PATH, ASSISTANT, LLM_BUDGET, LLM_RETRY, TASK_MAX_OUTPUT_TOKENS, XAI_REQUEST } from '../src/config/limits.ts'
import { toHttpError } from '../src/http/routes/assistant.ts'
import { createBudget } from '../src/llm/budget.ts'
import { createLLMClient, type TaskRequest } from '../src/llm/client.ts'
import { isLLMError } from '../src/llm/errors.ts'
import { createProvider } from '../src/llm/factory.ts'
import { parseToolCards } from '../src/llm/prompts/cards.ts'
import {
  acceptsReasoningEffort,
  createXaiProvider,
  spendsReasoningTokens,
  XAI_DEFAULT_MODELS,
} from '../src/llm/providers/xai.ts'
import { toXaiJsonSchema } from '../src/llm/providers/xaiSchema.ts'
import { createRetrievalService } from '../src/retrieval/service.ts'
import type { Logger } from '../src/utils/logger.ts'
import type { AssistantReply } from '../src/assistant/schema.ts'
import type { AssistantChatResponse } from '../src/domain/types.ts'
import {
  capturingLogger,
  makeAssistantReply,
  readJson,
  testContainer,
  testEnv,
  testLogger,
  withServer,
} from './helpers.ts'

/** A fake credential. Distinctive, so a leak is unambiguous in any assertion. */
const KEY = 'xai-TEST-KEY-must-never-appear-9f31c7a2'

/* ── fake transport ───────────────────────────────────────────────────────── */

interface RecordedCall {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

type Reply =
  | { status: number; json: unknown; headers?: Record<string, string> }
  | { status: number; text: string; headers?: Record<string, string> }
  | { throws: Error }
  | { hang: true }
  | ((call: RecordedCall) => { status: number; json: unknown })

function fakeTransport(replies: Reply[]): { transport: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const queue = [...replies]

  const transport = (async (url: unknown, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(url),
      headers: (init?.headers as Record<string, string>) ?? {},
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    }
    calls.push(call)
    const reply = queue.shift()
    if (!reply) throw new Error('fake transport ran out of replies')
    if (typeof reply === 'function') {
      const built = reply(call)
      return new Response(JSON.stringify(built.json), { status: built.status })
    }
    if ('throws' in reply) throw reply.throws
    if ('hang' in reply) {
      // Resolves only when the adapter aborts, exactly like a stalled socket.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }
    const payload = 'json' in reply ? JSON.stringify(reply.json) : reply.text
    return new Response(payload, {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
    })
  }) as unknown as typeof fetch

  return { transport, calls }
}

/** A Responses API success envelope around `text`. */
function completedText(
  text: string,
  options: { model?: string; usage?: [number, number]; reasoning?: number } = {},
) {
  const [input, output] = options.usage ?? [900, 180]
  return {
    status: 200,
    json: {
      id: 'resp_test',
      object: 'response',
      status: 'completed',
      model: options.model ?? 'grok-4.7',
      output: [
        { type: 'reasoning', id: 'rs_1', summary: [] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
      ],
      usage: {
        input_tokens: input,
        output_tokens: output,
        output_tokens_details: { reasoning_tokens: options.reasoning ?? 60 },
        total_tokens: input + output,
      },
    },
  }
}

const completed = (payload: unknown, options?: Parameters<typeof completedText>[1]) =>
  completedText(JSON.stringify(payload), options)

/* ── harness ──────────────────────────────────────────────────────────────── */

function xai(
  replies: Reply[],
  options: { model?: string; timeoutMs?: number; logger?: Logger } = {},
) {
  const { transport, calls } = fakeTransport(replies)
  const provider = createXaiProvider({
    apiKey: KEY,
    modelFast: '',
    modelStrong: options.model ?? '',
    timeoutMs: options.timeoutMs ?? 5_000,
    transport,
    ...(options.logger ? { logger: options.logger } : {}),
  })
  const budget = createBudget({ maxLlmCalls: LLM_BUDGET.maxLlmCalls, maxTokens: LLM_BUDGET.maxTokens })
  const llm = createLLMClient({ provider, budget, logger: options.logger ?? testLogger() })
  return { provider, llm, budget, calls }
}

const USER_TURN = '<<<UNTRUSTED_USER_CONTENT_BEGIN_9d4e2b>>>\nsource: user message\n---\nedit my videos faster\n<<<UNTRUSTED_USER_CONTENT_END_9d4e2b>>>'

function assistantRequest(): TaskRequest<AssistantReply> {
  return {
    task: 'assistant',
    system: 'SYSTEM PROMPT — trusted instructions and candidate cards',
    user: USER_TURN,
    schema: AssistantReplySchema,
    schemaName: ASSISTANT_SCHEMA_NAME,
  }
}

async function expectLLMError(
  promise: Promise<unknown>,
  code: string,
  check?: (error: Error & { details: Record<string, unknown>; retryable: boolean }) => void,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(isLLMError(error), `expected an LLMError, got ${String(error)}`)
    assert.equal(error.code, code)
    check?.(error)
    return true
  })
}

/** The provider-level error the client wrapped, where the category lives. */
function causeDetails(error: Error): Record<string, unknown> {
  const cause = (error as Error & { cause?: unknown }).cause
  return isLLMError(cause) ? cause.details : {}
}

/* ═══ Request construction ═════════════════════════════════════════════════ */

await test('the xAI request is built from the trusted prompt, never merged', async (t) => {
  const { llm, calls } = xai([completed(makeAssistantReply())])
  await llm.run(assistantRequest())
  const [call] = calls
  assert.ok(call)

  await t.test('it posts once to the Responses endpoint', () => {
    assert.equal(calls.length, 1)
    assert.equal(call.url, 'https://api.x.ai/v1/responses')
  })

  await t.test('the key travels only as a Bearer header', () => {
    assert.equal(call.headers.authorization, `Bearer ${KEY}`)
    assert.equal(JSON.stringify(call.body).includes(KEY), false, 'the key must not be in the body')
  })

  await t.test('system → instructions and user → input, kept separate', () => {
    assert.match(String(call.body.instructions), /^SYSTEM PROMPT/)
    assert.equal(call.body.input, USER_TURN)
    assert.equal(String(call.body.instructions).includes('edit my videos faster'), false)
  })

  await t.test('structured output is strict json_schema from AssistantReplySchema', () => {
    const format = (call.body.text as { format: Record<string, unknown> }).format
    assert.equal(format.type, 'json_schema')
    assert.equal(format.strict, true)
    assert.equal(format.name, 'AssistantReply')
    assert.deepEqual(format.schema, toXaiJsonSchema(AssistantReplySchema))
  })

  await t.test('the default model, reasoning effort and output ceiling', () => {
    assert.equal(call.body.model, XAI_DEFAULT_MODELS.strong)
    assert.deepEqual(call.body.reasoning, { effort: XAI_REQUEST.reasoningEffort })
    assert.equal(
      call.body.max_output_tokens,
      TASK_MAX_OUTPUT_TOKENS.assistant + XAI_REQUEST.reasoningAllowanceTokens,
    )
  })

  await t.test('nothing is left in the vendor store', () => {
    assert.equal(call.body.store, false)
  })

  await t.test('no temperature is invented when the task sets none', () => {
    assert.equal('temperature' in call.body, false)
  })
})

await test('the xAI schema keeps the contract the decoder can enforce', async (t) => {
  const schema = toXaiJsonSchema(AssistantReplySchema) as Record<string, any>

  await t.test('bounds survive, so the decoder enforces them', () => {
    assert.equal(schema.properties.message.maxLength, ASSISTANT.maxMessageReplyChars)
    assert.equal(schema.properties.plan.properties.steps.maxItems, ASSISTANT.maxPlanSteps)
    assert.equal(
      schema.properties.plan.properties.steps.items.properties.alsoGoodToolIds.maxItems,
      ASSISTANT.maxAlsoGood,
    )
  })

  await t.test('optional fields stay optional by omission, not by null', () => {
    assert.equal(schema.required.includes('plan'), false)
    assert.equal(JSON.stringify(schema).includes('"null"'), false)
  })

  await t.test('every object is closed', () => {
    assert.equal(schema.additionalProperties, false)
    assert.equal(schema.properties.understood.additionalProperties, false)
    assert.equal(schema.properties.plan.properties.steps.items.additionalProperties, false)
  })

  await t.test('metadata xAI does not need is removed', () => {
    assert.equal('$schema' in schema, false)
  })
})

/* ═══ Model configuration ══════════════════════════════════════════════════ */

await test('model configuration', async (t) => {
  await t.test('LLM_MODEL_STRONG overrides the default', async () => {
    const { provider, llm, calls } = xai([completed(makeAssistantReply())], { model: 'grok-4.6' })
    assert.equal(provider.modelFor('strong'), 'grok-4.6')
    await llm.run(assistantRequest())
    assert.equal(calls[0]?.body.model, 'grok-4.6')
  })

  await t.test('a non-reasoning model gets neither effort nor allowance', async () => {
    const model = 'grok-4.20-0309-non-reasoning'
    const { llm, calls } = xai([completed(makeAssistantReply(), { model })], { model })
    await llm.run(assistantRequest())
    assert.equal('reasoning' in (calls[0]?.body ?? {}), false)
    assert.equal(calls[0]?.body.max_output_tokens, TASK_MAX_OUTPUT_TOKENS.assistant)
  })

  await t.test('effort is only sent to the families documented to accept it', () => {
    for (const model of ['grok-4.5', 'grok-4.6', 'grok-4.7', 'GROK-4.7']) {
      assert.equal(acceptsReasoningEffort(model), true, model)
    }
    for (const model of ['grok-4.3', 'grok-4.20-0309-reasoning', 'grok-build-0.1', 'grok-5']) {
      assert.equal(acceptsReasoningEffort(model), false, model)
    }
    assert.equal(spendsReasoningTokens('grok-4.20-0309-non-reasoning'), false)
    assert.equal(spendsReasoningTokens('grok-4.7'), true)
  })

  await t.test('the factory builds xai from the environment', () => {
    const provider = createProvider({
      env: testEnv({
        llm: { provider: 'xai', apiKey: KEY, modelStrong: 'grok-4.6', timeoutMs: 30_000 },
      }),
    })
    assert.equal(provider.id, 'xai')
    assert.equal(provider.modelFor('strong'), 'grok-4.6')
  })

  await t.test('the factory falls back to the adapter default model', () => {
    const provider = createProvider({
      env: testEnv({ llm: { provider: 'xai', apiKey: KEY, timeoutMs: 30_000 } }),
    })
    assert.equal(provider.modelFor('strong'), XAI_DEFAULT_MODELS.strong)
  })
})

/* ═══ No API key ═══════════════════════════════════════════════════════════ */

await test('xai without a key refuses to start, and never falls back', async (t) => {
  await t.test('the factory throws an actionable config error', () => {
    assert.throws(
      () => createProvider({ env: testEnv({ llm: { provider: 'xai', timeoutMs: 60_000 } }) }),
      (error: Error) => {
        assert.match(error.message, /LLM_PROVIDER="xai" requires LLM_API_KEY/)
        assert.match(error.message, /VITE_/, 'must warn against the browser-bundle prefix')
        return true
      },
    )
  })

  await t.test('the container refuses too — no silent mock', () => {
    assert.throws(
      () => testContainer(testEnv({ llm: { provider: 'xai', timeoutMs: 60_000 } })),
      /requires LLM_API_KEY/,
    )
  })

  await t.test('loadEnv warns at boot', () => {
    const { warnings } = loadEnv({ LLM_PROVIDER: 'xai' })
    assert.ok(warnings.some((warning) => /LLM_API_KEY is not/.test(warning)))
  })

  await t.test('loadEnv reads the xai settings from the existing variables', () => {
    const { env } = loadEnv({ LLM_PROVIDER: 'xai', LLM_API_KEY: KEY, LLM_MODEL_STRONG: 'grok-4.7' })
    assert.equal(env.llm.provider, 'xai')
    assert.equal(env.llm.apiKey, KEY)
    assert.equal(env.llm.modelStrong, 'grok-4.7')
  })
})

/* ═══ Successful structured response ═══════════════════════════════════════ */

await test('a structured Grok response validates through AssistantReplySchema', async (t) => {
  const reply = makeAssistantReply()
  const { llm, budget, calls } = xai([
    completed(reply, { model: 'grok-4.7-0801', usage: [1200, 240], reasoning: 90 }),
  ])
  const result = await llm.run(assistantRequest())

  await t.test('it is the typed reply, on the first attempt', () => {
    assert.deepEqual(result.data, reply)
    assert.equal(result.attempts, 1)
    assert.equal(calls.length, 1, 'exactly one model call')
  })

  await t.test('the served model id and usage are reported', () => {
    assert.equal(result.model, 'grok-4.7-0801')
    assert.deepEqual(result.usage, { inputTokens: 1200, outputTokens: 240 })
    assert.deepEqual(budget.usage, { calls: 1, inputTokens: 1200, outputTokens: 240 })
  })
})

/* ═══ Malformed and schema-invalid output ══════════════════════════════════ */

await test('bad model output is a model failure, never content', async (t) => {
  await t.test('non-JSON text is repaired, then surfaces as LLM_SCHEMA', async () => {
    const bad = completedText('Sure! Here is your plan: step one…')
    const { llm, calls } = xai([bad, bad, bad])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_SCHEMA')
    assert.equal(calls.length, LLM_RETRY.schemaAttempts, 'the existing bounded ladder, no more')
    assert.match(String(calls[1]?.body.input), /did not satisfy the required schema/)
  })

  await t.test('schema-invalid JSON surfaces as LLM_SCHEMA — the schema is not weakened', async () => {
    const invalid = completed({ ...makeAssistantReply(), intent: 'sell_something', extra: true })
    const { llm, calls } = xai([invalid, invalid, invalid])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_SCHEMA')
    assert.equal(calls.length, LLM_RETRY.schemaAttempts)
  })

  await t.test('one bad answer then a good one recovers on attempt two', async () => {
    const { llm } = xai([completedText('{"message":'), completed(makeAssistantReply())])
    assert.equal((await llm.run(assistantRequest())).attempts, 2)
  })

  await t.test('a refusal part surfaces as LLM_REFUSAL', async () => {
    const refusal = {
      status: 200,
      json: {
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I cannot help.' }] }],
        usage: { input_tokens: 10, output_tokens: 3 },
      },
    }
    const { llm } = xai([refusal, refusal, refusal])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_REFUSAL')
  })

  await t.test('a response truncated at the ceiling is retried and charged to the budget', async () => {
    const truncated = {
      status: 200,
      json: {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
        usage: { input_tokens: 1000, output_tokens: 6144 },
      },
    }
    const { llm, budget, calls } = xai([truncated, completed(makeAssistantReply(), { usage: [1000, 200] })])
    const result = await llm.run(assistantRequest())
    assert.equal(result.attempts, 2)
    assert.equal(calls.length, 2)
    assert.equal(budget.usage.outputTokens, 6144 + 200, 'the truncated call still counts')
  })
})

/* ═══ Transport and HTTP failures ══════════════════════════════════════════ */

await test('provider failures map onto the existing error vocabulary', async (t) => {
  await t.test('a timeout is LLM_UNAVAILABLE and is not retried', async () => {
    const { llm, calls } = xai([{ hang: true }], { timeoutMs: 20 })
    await expectLLMError(llm.run(assistantRequest()), 'LLM_UNAVAILABLE', (error) => {
      assert.equal(error.retryable, false)
      assert.equal(causeDetails(error).category, 'timeout')
    })
    assert.equal(calls.length, 1, 'one timeout, not three')
  })

  await t.test('401 is LLM_UNAVAILABLE, not retried, and never echoes the vendor text', async () => {
    // Vendors quote a masked fragment of the key back. It must go nowhere.
    const { llm, calls } = xai([
      { status: 401, json: { error: `Incorrect API key provided: ${KEY.slice(0, 10)}***` } },
    ])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_UNAVAILABLE', (error) => {
      const cause = (error as Error & { cause?: Error }).cause
      assert.equal(causeDetails(error).category, 'auth')
      assert.equal(String(cause?.message).includes(KEY.slice(0, 10)), false)
      assert.equal(JSON.stringify(causeDetails(error)).includes(KEY.slice(0, 10)), false)
    })
    assert.equal(calls.length, 1)
  })

  await t.test('403 is treated as a credential failure too', async () => {
    const { llm } = xai([{ status: 403, json: { error: 'forbidden' } }])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_UNAVAILABLE', (error) => {
      assert.equal(causeDetails(error).category, 'auth')
    })
  })

  await t.test('429 is a rate limit: not retried, Retry-After recorded', async () => {
    const { llm, calls } = xai([
      { status: 429, json: { error: 'Too many requests' }, headers: { 'retry-after': '7' } },
    ])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_UNAVAILABLE', (error) => {
      assert.equal(causeDetails(error).category, 'rate_limited')
      assert.equal(causeDetails(error).retryAfterSeconds, 7)
    })
    assert.equal(calls.length, 1)
  })

  await t.test('a 5xx is retried on the existing ladder, then LLM_UNAVAILABLE', async () => {
    const down = { status: 503, text: '<html>upstream unavailable</html>' }
    const { llm, calls } = xai([down, down, down])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_UNAVAILABLE', (error) => {
      assert.equal(causeDetails(error).category, 'server_error')
    })
    assert.equal(calls.length, LLM_RETRY.schemaAttempts)
  })

  await t.test('a dropped connection is retried, and a recovery succeeds', async () => {
    const { llm, calls } = xai([{ throws: new TypeError('fetch failed') }, completed(makeAssistantReply())])
    assert.equal((await llm.run(assistantRequest())).attempts, 2)
    assert.equal(calls.length, 2)
  })

  await t.test('an unknown model is a config failure naming the variable', async () => {
    const { llm, calls } = xai([{ status: 404, json: { error: 'model not found' } }], {
      model: 'grok-9-imaginary',
    })
    await expectLLMError(llm.run(assistantRequest()), 'LLM_UNAVAILABLE', (error) => {
      const cause = (error as Error & { cause?: Error }).cause
      assert.equal(causeDetails(error).category, 'model_not_found')
      assert.match(String(cause?.message), /LLM_MODEL_STRONG/)
      assert.match(String(cause?.message), /grok-9-imaginary/)
    })
    assert.equal(calls.length, 1)
  })

  await t.test('a context-length rejection is recognised and not retried', async () => {
    const { llm, calls } = xai([
      { status: 400, json: { code: 'invalid_argument', error: "This model's maximum prompt length is 131072 tokens" } },
    ])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_UNAVAILABLE', (error) => {
      assert.equal(causeDetails(error).category, 'context_length')
    })
    assert.equal(calls.length, 1)
  })

  await t.test('an unreadable body is LLM_UNAVAILABLE', async () => {
    const junk = { status: 200, text: 'not json at all' }
    const { llm } = xai([junk, junk, junk])
    await expectLLMError(llm.run(assistantRequest()), 'LLM_UNAVAILABLE', (error) => {
      assert.equal(causeDetails(error).category, 'unreadable')
    })
  })

  await t.test('the route maps every provider failure to a generic, key-free 503/422', async () => {
    const { llm } = xai([{ status: 401, json: { error: KEY } }])
    const error = await llm.run(assistantRequest()).catch((caught: unknown) => caught)
    const mapped = toHttpError(error) as { status: number; code: string; message: string; details?: unknown }
    assert.equal(mapped.status, 503)
    assert.equal(mapped.code, 'PROVIDER_UNAVAILABLE')
    assert.equal(mapped.message, 'The assistant is temporarily unavailable. Please try again.')
    assert.equal(JSON.stringify(mapped).includes(KEY), false)
  })
})

/* ═══ Log hygiene ══════════════════════════════════════════════════════════ */

await test('provider diagnostics never log secrets, prompts or answers', async (t) => {
  const captured = capturingLogger('debug', 'json')
  const reply = makeAssistantReply({ message: 'UNIQUE-MODEL-ANSWER-TEXT for the reader' })

  const ok = xai([completed(reply)], { logger: captured.logger })
  await ok.llm.run(assistantRequest())
  const failing = xai([{ status: 401, json: { error: `bad key ${KEY}` } }], { logger: captured.logger })
  await failing.llm.run(assistantRequest()).catch(() => undefined)

  const text = captured.text()

  await t.test('the useful fields are there', () => {
    assert.match(text, /Provider call succeeded/)
    assert.match(text, /"provider":"xai"/)
    assert.match(text, /"model":"grok-4.7"/)
    assert.match(text, /"durationMs":\d+/)
    assert.match(text, /"reasoningTokens":\d+/)
    assert.match(text, /"category":"auth"/)
    assert.match(text, /"status":401/)
  })

  await t.test('the key never appears, even with no redaction registered', () => {
    assert.equal(text.includes(KEY), false)
    assert.equal(text.includes('Bearer'), false)
  })

  await t.test('neither the user text nor the model answer is logged', () => {
    assert.equal(text.includes('edit my videos faster'), false)
    assert.equal(text.includes('UNIQUE-MODEL-ANSWER-TEXT'), false)
    assert.equal(text.includes('SYSTEM PROMPT'), false)
  })
})

/* ═══ End to end: the real engine, grounding and route ═════════════════════ */

/**
 * A stand-in for Grok that answers from the candidate cards in the prompt it
 * is sent — plus one fabricated id, to prove grounding still has the last word.
 */
function grokFromCards(call: RecordedCall) {
  const cards = parseToolCards(String(call.body.instructions))
  const seen = new Set<string>()
  const steps = cards
    .filter((card) => {
      const stage = card.stages[0]
      if (!stage || seen.has(stage)) return false
      seen.add(stage)
      return true
    })
    .slice(0, 2)
    .map((card, index) => ({
      stage: card.stages[0] as string,
      toolId: card.id,
      alsoGoodToolIds: index === 0 ? ['fabricated-tool-does-not-exist'] : [],
    }))
  return completed({
    message: 'Here is a two-step plan built from your candidates.',
    intent: 'recommend',
    understood: { goal: 'edit videos faster', constraints: [] },
    plan: { steps },
    followUps: ['Free tools only'],
  })
}

await test('Grok plugs into the unchanged engine and grounding gate', async (t) => {
  const logger = testLogger()
  const catalogue = createJsonToolCatalogue({ logger })
  const retrieval = createRetrievalService({ catalogue, logger })
  const { transport, calls } = fakeTransport([grokFromCards])
  const provider = createXaiProvider({
    apiKey: KEY,
    modelFast: '',
    modelStrong: '',
    timeoutMs: 5_000,
    transport,
  })
  let clients = 0
  const engine = createAssistantEngine({
    retrieval,
    catalogue,
    createClient: () => {
      clients += 1
      return createLLMClient({
        provider,
        budget: createBudget({ maxLlmCalls: LLM_BUDGET.maxLlmCalls, maxTokens: LLM_BUDGET.maxTokens }),
        logger,
      })
    },
    automations: () => Promise.resolve(createAutomationMatcher([])),
    logger,
  })

  const response = await engine.runTurn({
    message: 'I am a video editor and I want to edit my YouTube videos faster',
  })

  await t.test('one client and one model call for one turn', () => {
    assert.equal(clients, 1)
    assert.equal(calls.length, 1)
  })

  await t.test('only candidate cards reached the model — never the whole catalogue', async () => {
    const shown = parseToolCards(String(calls[0]?.body.instructions))
    assert.ok(shown.length > 0)
    assert.ok(shown.length < (await catalogue.size()), 'a candidate set, not the catalogue')
  })

  await t.test('the plan is hydrated from the catalogue', () => {
    assert.equal(response.intent, 'recommend')
    assert.equal(response.plan?.steps.length, 2)
    assert.equal(response.meta.model, XAI_DEFAULT_MODELS.strong)
  })

  await t.test('grounding dropped the fabricated id', () => {
    assert.deepEqual(response.meta.droppedToolIds, ['fabricated-tool-does-not-exist'])
    const named = JSON.stringify(response.plan)
    assert.equal(named.includes('fabricated-tool-does-not-exist'), false)
  })

  await t.test('the context is still server-authoritative and advances', () => {
    assert.equal(response.context.turn, 1)
  })
})

await test('POST /api/assistant/chat runs on Grok with the response contract unchanged', async (t) => {
  const original = globalThis.fetch
  const { transport: fakeXai, calls } = fakeTransport([
    grokFromCards,
    { status: 401, json: { error: `key ${KEY} rejected` } },
  ])
  // Only api.x.ai is faked; the test's own requests to the local server pass through.
  globalThis.fetch = ((input: unknown, init?: RequestInit) =>
    String(input).startsWith('https://api.x.ai/')
      ? fakeXai(input as string, init)
      : original(input as string, init)) as typeof fetch

  try {
    const container = testContainer(
      testEnv({ llm: { provider: 'xai', apiKey: KEY, timeoutMs: 5_000 } }),
    )

    await withServer(container, async (server) => {
      const post = (message: string) =>
        fetch(`${server.origin}${API_BASE_PATH}/assistant/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message }),
        })

      await t.test('a recommendation arrives in the existing shape', async () => {
        const response = await post('I want to edit my YouTube videos faster')
        assert.equal(response.status, 200)
        const body = await readJson<AssistantChatResponse>(response)
        assert.equal(body.intent, 'recommend')
        assert.ok(body.plan && body.plan.steps.length > 0)
        assert.ok(body.context)
        assert.equal(body.meta.model, 'grok-4.7')
        assert.equal(calls.length, 1, 'no duplicate model call')
      })

      await t.test('a provider failure is a generic 503 carrying no secret', async () => {
        const response = await post('I want to edit my YouTube videos faster')
        const text = await response.text()
        assert.equal(response.status, 503)
        assert.match(text, /PROVIDER_UNAVAILABLE/)
        assert.equal(text.includes(KEY), false)
        assert.equal(text.includes('xAI'), false, 'the vendor is not named to the client')
        assert.equal(calls.length, 2, 'a 401 is not retried')
      })
    })
  } finally {
    globalThis.fetch = original
  }
})
