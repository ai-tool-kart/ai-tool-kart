/*
 * xAI provider adapter tests.
 *
 * Offline, like the OpenAI suite: the adapter takes a `transport` seam, so no
 * test needs XAI_API_KEY or reaches api.x.ai.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createBudget } from '../src/llm/budget.ts'
import { createLLMClient } from '../src/llm/client.ts'
import { createProvider } from '../src/llm/factory.ts'
import {
  acceptsReasoningEffort,
  createXaiProvider,
  XAI_DEFAULT_BASE_URL,
} from '../src/llm/providers/xai.ts'
import { toStrictJsonSchema } from '../src/llm/providers/openaiSchema.ts'
import { ClassificationSchema } from '../src/llm/schemas.ts'
import { XAI_REQUEST } from '../src/config/limits.ts'
import { describeEnv, loadEnv } from '../src/config/env.ts'
import { clearSecrets } from '../src/utils/logger.ts'
import { testEnv, testLogger } from './helpers.ts'

const KEY = 'xai-test-not-a-real-key-000000000000'
const MODEL = 'grok-4.7'

interface RecordedCall {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

type Reply =
  | { status: number; json: unknown; headers?: Record<string, string> }
  | { throws: Error }

function fakeTransport(replies: Reply[]) {
  const calls: RecordedCall[] = []
  const queue = [...replies]
  const transport = (async (url: unknown, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: (init?.headers as Record<string, string>) ?? {},
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    })
    const reply = queue.shift()
    if (!reply) throw new Error('fake transport ran out of replies')
    if ('throws' in reply) throw reply.throws
    return new Response(JSON.stringify(reply.json), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
    })
  }) as unknown as typeof fetch
  return { transport, calls }
}

function completed(payload: unknown, usage: [number, number] = [120, 40]) {
  return {
    status: 200,
    json: {
      id: 'resp_test',
      status: 'completed',
      model: MODEL,
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(payload) }] },
      ],
      usage: { input_tokens: usage[0], output_tokens: usage[1] },
    },
  }
}

const VALID_CLASSIFICATION = {
  relevance: 8,
  importance: 7,
  novelty: 6,
  category: 'ai-models',
  reasoning: 'A new flagship model with a concrete capability change.',
  recommendation: 'proceed',
}

const CLASSIFY_REQUEST = {
  task: 'classify' as const,
  modelClass: 'fast' as const,
  system: 'our instructions only',
  input: 'untrusted source text',
  schema: ClassificationSchema,
  schemaName: 'Classification',
  maxOutputTokens: 512,
  temperature: 0,
}

function provider(replies: Reply[], model = MODEL) {
  const { transport, calls } = fakeTransport(replies)
  return {
    calls,
    instance: createXaiProvider({
      apiKey: KEY,
      modelFast: model,
      modelStrong: model,
      timeoutMs: 5000,
      transport,
      sleepFn: async () => {},
    }),
  }
}

type ThrownAgentError = Error & {
  code?: string
  fatal?: boolean
  retryable?: boolean
  details?: Record<string, unknown>
}

/* ── wire format ──────────────────────────────────────────────────────────── */

test('xAI: requests go to api.x.ai/v1/responses with the key only in the header', async () => {
  const { instance, calls } = provider([completed(VALID_CLASSIFICATION)])
  await instance.complete(CLASSIFY_REQUEST)

  const call = calls[0]!
  assert.equal(XAI_DEFAULT_BASE_URL, 'https://api.x.ai/v1')
  assert.equal(call.url, 'https://api.x.ai/v1/responses')
  assert.equal(call.headers.authorization, `Bearer ${KEY}`)
  assert.ok(!JSON.stringify(call.body).includes(KEY))
})

test('xAI: instructions and untrusted input stay in separate fields', async () => {
  const { instance, calls } = provider([completed(VALID_CLASSIFICATION)])
  await instance.complete(CLASSIFY_REQUEST)
  assert.equal(calls[0]!.body.instructions, 'our instructions only')
  assert.equal(calls[0]!.body.input, 'untrusted source text')
})

test('xAI: strict json_schema, temperature, reasoning effort and output allowance', async () => {
  const { instance, calls } = provider([completed(VALID_CLASSIFICATION)])
  await instance.complete(CLASSIFY_REQUEST)

  const body = calls[0]!.body
  assert.equal(body.model, MODEL)
  assert.deepEqual(body.text, {
    format: {
      type: 'json_schema',
      name: 'Classification',
      strict: true,
      schema: toStrictJsonSchema(ClassificationSchema),
    },
  })
  assert.equal(body.temperature, 0)
  assert.equal(body.store, false)
  assert.deepEqual(body.reasoning, { effort: XAI_REQUEST.reasoningEffort })
  assert.equal(body.max_output_tokens, 512 + XAI_REQUEST.reasoningAllowanceTokens)
})

test('xAI: non-reasoning models get no allowance and no reasoning effort', async () => {
  const { instance, calls } = provider([completed(VALID_CLASSIFICATION)], 'grok-4-fast-non-reasoning')
  await instance.complete(CLASSIFY_REQUEST)
  assert.equal(calls[0]!.body.max_output_tokens, 512)
  assert.equal(calls[0]!.body.reasoning, undefined)
  assert.equal(acceptsReasoningEffort('grok-4.7'), true)
  assert.equal(acceptsReasoningEffort('grok-4'), false)
})

test('xAI: reasoning items are skipped and nulls for absent optional fields are dropped', async () => {
  const { instance } = provider([completed({ ...VALID_CLASSIFICATION, extra: null })])
  const raw = await instance.complete(CLASSIFY_REQUEST)
  assert.deepEqual(JSON.parse(raw.text), VALID_CLASSIFICATION)
  assert.equal(raw.model, MODEL)
})

/* ── failures ─────────────────────────────────────────────────────────────── */

test('xAI: 401/403 are fatal CONFIG errors, never retried, and never echo the vendor message', async () => {
  for (const status of [401, 403]) {
    const { instance, calls } = provider([
      { status, json: { code: 'x', error: `Incorrect API key provided: xai-****${KEY.slice(-4)}` } },
    ])
    await assert.rejects(
      () => instance.complete(CLASSIFY_REQUEST),
      (error: ThrownAgentError) => {
        assert.equal(error.code, 'CONFIG')
        assert.equal(error.fatal, true)
        assert.match(error.message, /^xAI rejected the request/)
        assert.match(error.message, /XAI_API_KEY/)
        assert.ok(!error.message.includes(KEY.slice(-4)))
        assert.equal(error.details?.provider, 'xai')
        return true
      },
    )
    assert.equal(calls.length, 1)
  }
})

test('xAI: a 400 for an invalid key (what xAI actually returns) is a fatal credential error', async () => {
  const { instance, calls } = provider([
    {
      status: 400,
      json: { code: 'Client specified an invalid argument', error: 'Incorrect API key provided: xa***00.' },
    },
  ])
  await assert.rejects(
    () => instance.complete(CLASSIFY_REQUEST),
    (error: ThrownAgentError) => {
      assert.equal(error.code, 'CONFIG')
      assert.equal(error.fatal, true)
      assert.match(error.message, /XAI_API_KEY/)
      assert.ok(!error.message.includes('xa***00'))
      return true
    },
  )
  assert.equal(calls.length, 1)
})

test('xAI: a rate limit is retried within bounds, then reported as LLM_UNAVAILABLE', async () => {
  const limited = { status: 429, json: { error: 'Too many requests' }, headers: { 'retry-after': '0' } }
  const { instance, calls } = provider([limited, limited, limited])
  await assert.rejects(
    () => instance.complete(CLASSIFY_REQUEST),
    (error: ThrownAgentError) => {
      assert.equal(error.code, 'LLM_UNAVAILABLE')
      assert.equal(error.retryable, true)
      assert.match(error.message, /^xAI: .*429/)
      assert.equal(error.details?.provider, 'xai')
      return true
    },
  )
  assert.equal(calls.length, 3)
})

test('xAI: a 429 for exhausted credit is fatal and not retried', async () => {
  const { instance, calls } = provider([
    { status: 429, json: { code: 'x', error: 'Your team has reached its monthly spending limit.' } },
  ])
  await assert.rejects(
    () => instance.complete(CLASSIFY_REQUEST),
    (error: ThrownAgentError) => {
      assert.equal(error.code, 'CONFIG')
      assert.equal(error.fatal, true)
      assert.match(error.message, /billing/)
      return true
    },
  )
  assert.equal(calls.length, 1)
})

test('xAI: a 404 points at XAI_MODEL', async () => {
  const { instance } = provider([{ status: 404, json: { error: 'model not found' } }])
  await assert.rejects(() => instance.complete(CLASSIFY_REQUEST), /XAI_MODEL/)
})

test('xAI: network failures and 5xx are retried, then attributed to xAI', async () => {
  const { instance, calls } = provider([
    { throws: new Error('ECONNRESET') },
    { status: 503, json: { error: 'unavailable' } },
    completed(VALID_CLASSIFICATION),
  ])
  const raw = await instance.complete(CLASSIFY_REQUEST)
  assert.equal(JSON.parse(raw.text).category, 'ai-models')
  assert.equal(calls.length, 3)
})

test('xAI: a truncated response charges its tokens and is not returned as content', async () => {
  const truncated = {
    status: 200,
    json: {
      status: 'incomplete',
      model: MODEL,
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"rele' }] }],
      usage: { input_tokens: 500, output_tokens: 4608 },
    },
  }
  const { transport } = fakeTransport([truncated, truncated, truncated])
  const budget = createBudget({ maxLlmCallsPerRun: 10, maxTokensPerRun: 100_000 })
  const llm = createLLMClient({
    provider: createXaiProvider({
      apiKey: KEY,
      modelFast: MODEL,
      modelStrong: MODEL,
      timeoutMs: 5000,
      transport,
      sleepFn: async () => {},
    }),
    budget,
    logger: testLogger(),
  })

  await assert.rejects(
    () =>
      llm.run({
        task: 'classify',
        system: 'instructions',
        user: 'candidate',
        schema: ClassificationSchema,
        schemaName: 'Classification',
      }),
    (error: ThrownAgentError) => {
      assert.equal(error.code, 'LLM_UNAVAILABLE')
      assert.equal(error.details?.provider, 'xai')
      assert.equal(error.details?.task, 'classify')
      return true
    },
  )
  assert.equal(budget.usage.outputTokens, 4608 * 3)
})

test('xAI: usage reaches the run budget through the shared client', async () => {
  const { transport } = fakeTransport([completed(VALID_CLASSIFICATION, [1234, 56])])
  const budget = createBudget({ maxLlmCallsPerRun: 10, maxTokensPerRun: 100_000 })
  const llm = createLLMClient({
    provider: createXaiProvider({ apiKey: KEY, modelFast: MODEL, modelStrong: MODEL, timeoutMs: 5000, transport }),
    budget,
    logger: testLogger(),
  })
  const response = await llm.run({
    task: 'classify',
    system: 'instructions',
    user: 'candidate',
    schema: ClassificationSchema,
    schemaName: 'Classification',
  })
  assert.equal(response.data.recommendation, 'proceed')
  assert.deepEqual(
    [budget.usage.calls, budget.usage.inputTokens, budget.usage.outputTokens],
    [1, 1234, 56],
  )
})

/* ── environment and factory ──────────────────────────────────────────────── */

test('xAI env: XAI_API_KEY and XAI_MODEL configure the provider for every task', () => {
  clearSecrets()
  const { env, warnings } = loadEnv({
    LLM_PROVIDER: 'xai',
    XAI_API_KEY: KEY,
    XAI_MODEL: 'grok-4.7',
    AGENT_DB_PATH: ':memory:',
  } as NodeJS.ProcessEnv)

  assert.deepEqual(warnings, [])
  const instance = createProvider({ env })
  assert.equal(instance.id, 'xai')
  assert.equal(instance.modelFor('fast'), 'grok-4.7')
  assert.equal(instance.modelFor('strong'), 'grok-4.7')
  assert.ok(!JSON.stringify(describeEnv(env)).includes(KEY))
  clearSecrets()
})

test('xAI env: a missing XAI_API_KEY fails startup with a clear message', () => {
  assert.throws(
    () =>
      loadEnv({ LLM_PROVIDER: 'xai', XAI_MODEL: 'grok-4.7', AGENT_DB_PATH: ':memory:' } as NodeJS.ProcessEnv),
    /XAI_API_KEY is not configured/,
  )
  // An OpenAI-era LLM_API_KEY must not be accepted in its place.
  assert.throws(
    () =>
      loadEnv({
        LLM_PROVIDER: 'xai',
        LLM_API_KEY: 'sk-old-openai-key',
        XAI_MODEL: 'grok-4.7',
        AGENT_DB_PATH: ':memory:',
      } as NodeJS.ProcessEnv),
    /XAI_API_KEY is not configured/,
  )
  assert.throws(
    () => createProvider({ env: testEnv({ llm: { provider: 'xai', modelStrong: MODEL } }) }),
    /XAI_API_KEY is not configured/,
  )
  clearSecrets()
})

test('xAI env: a missing XAI_MODEL fails startup with a clear message', () => {
  assert.throws(
    () => loadEnv({ LLM_PROVIDER: 'xai', XAI_API_KEY: KEY, AGENT_DB_PATH: ':memory:' } as NodeJS.ProcessEnv),
    /XAI_MODEL is not configured/,
  )
  assert.throws(
    () => createProvider({ env: testEnv({ llm: { provider: 'xai', apiKey: KEY } }) }),
    /XAI_MODEL is not configured/,
  )
  clearSecrets()
})

test('xAI env: leftover OpenAI variables are ignored with a warning, never sent to xAI', () => {
  clearSecrets()
  const { env, warnings } = loadEnv({
    LLM_PROVIDER: 'xai',
    XAI_API_KEY: KEY,
    XAI_MODEL: 'grok-4.7',
    LLM_API_KEY: 'sk-old-openai-key',
    LLM_MODEL_FAST: 'gpt-5.6-luna',
    LLM_MODEL_STRONG: 'gpt-5.6-terra',
    AGENT_DB_PATH: ':memory:',
  } as NodeJS.ProcessEnv)

  assert.equal(env.llm.apiKey, KEY)
  assert.equal(env.llm.modelFast, 'grok-4.7')
  assert.equal(env.llm.modelStrong, 'grok-4.7')
  assert.equal(warnings.length, 2)
  assert.ok(warnings.every((warning) => !warning.includes('sk-old-openai-key')))
  clearSecrets()
})

test('xAI env: the agent starts with no OpenAI configuration at all', () => {
  clearSecrets()
  const { env } = loadEnv({
    LLM_PROVIDER: 'xai',
    XAI_API_KEY: KEY,
    XAI_MODEL: 'grok-4.7',
    AGENT_DB_PATH: ':memory:',
  } as NodeJS.ProcessEnv)
  assert.equal(createProvider({ env }).id, 'xai')
  clearSecrets()
})
