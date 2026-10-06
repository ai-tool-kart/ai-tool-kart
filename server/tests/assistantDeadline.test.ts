/*
 * The assistant's whole-turn deadline (ASSISTANT.turnDeadlineMs).
 *
 * The site reaches the API through a Vercel external rewrite that cuts a
 * request off at 120 s with a bare 502. A turn can make several model calls,
 * each allowed LLM_TIMEOUT_MS, so the engine owns ONE deadline for the whole
 * turn and threads it down as an AbortSignal:
 *
 *   engine.runTurn → client.run (no new attempt after the deadline)
 *                  → provider.complete (in-flight HTTP call aborted)
 *
 * and the route answers a deliberate 503 instead of the proxy's 502. These
 * tests use millisecond deadlines; the production value is asserted
 * separately.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssistantEngine } from '../src/assistant/engine.ts'
import { createAutomationMatcher } from '../src/automations/match.ts'
import { ASSISTANT } from '../src/config/limits.ts'
import { isApiError } from '../src/domain/errors.ts'
import type { Tool } from '../src/domain/types.ts'
import { toHttpError } from '../src/http/routes/assistant.ts'
import { createBudget } from '../src/llm/budget.ts'
import { createLLMClient } from '../src/llm/client.ts'
import { isLLMError } from '../src/llm/errors.ts'
import type { LLMProvider, LLMRawResponse, LLMRequest } from '../src/llm/provider.ts'
import { createMockProvider } from '../src/llm/providers/mock.ts'
import { createXaiProvider } from '../src/llm/providers/xai.ts'
import { createRetrievalService } from '../src/retrieval/service.ts'
import { z } from 'zod'
import { fixtureCatalogue, makeTool, testLogger } from './helpers.ts'

const QUERY = 'I am a video editor and I want to speed up my YouTube editing workflow'

const TOOLS: Tool[] = [
  makeTool({
    id: 'beta-editor',
    slug: 'beta-editor',
    name: 'Beta Editor',
    mono: 'Be',
    cat: 'Video',
    model: 'Subscription',
    price: 'From $12/mo',
    pricingTier: 'paid',
    rating: 4.4,
    pop: 88,
    url: 'https://beta-editor.example',
    tags: ['Video editing'],
    roles: ['Video Editor'],
    useCases: ['Edit long videos'],
    stages: ['edit'],
    tagline: 'Cuts long video down to the parts worth keeping.',
    summary: 'Beta Editor trims long video recordings into a finished cut.',
  }),
  makeTool({
    id: 'clip-maker',
    slug: 'clip-maker',
    name: 'Clip Maker',
    mono: 'Cm',
    cat: 'Video',
    pricingTier: 'freemium',
    rating: 4.1,
    pop: 76,
    url: 'https://clip-maker.example',
    tags: ['Shorts'],
    roles: ['Video Editor', 'Content Creator'],
    useCases: ['Create shorts', 'Generate clips'],
    stages: ['edit', 'publish'],
    tagline: 'Turns a long video into short vertical clips.',
    summary: 'Clip Maker finds the strongest moments in a long video and cuts clips.',
  }),
]

/** A provider whose call only ends when the caller's signal aborts — a stalled model. */
function hangingProvider(): LLMProvider & { calls: number; abortedCalls: number } {
  const state = {
    id: 'hang',
    calls: 0,
    abortedCalls: 0,
    modelFor: () => 'hang-model',
    complete(request: LLMRequest<unknown>): Promise<LLMRawResponse> {
      state.calls += 1
      return new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => {
          state.abortedCalls += 1
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    },
  }
  return state
}

function client(provider: LLMProvider) {
  return createLLMClient({ provider, budget: createBudget({ maxLlmCalls: 10, maxTokens: 1_000_000 }), logger: testLogger('error') })
}

const TASK = {
  task: 'assistant' as const,
  system: 'system',
  user: 'user',
  schema: z.object({ ok: z.boolean() }).strict(),
  schemaName: 'probe',
}

function engineWith(provider: LLMProvider, turnDeadlineMs?: number) {
  const logger = testLogger('error')
  const catalogue = fixtureCatalogue(TOOLS)
  return createAssistantEngine({
    retrieval: createRetrievalService({ catalogue, logger }),
    catalogue,
    createClient: () => client(provider),
    automations: () => Promise.resolve(createAutomationMatcher([])),
    logger,
    ...(turnDeadlineMs !== undefined ? { turnDeadlineMs } : {}),
  })
}

await test('assistant turn deadline', async (t) => {
  await t.test('the production deadline sits under the 120 s proxy ceiling', () => {
    assert.ok(ASSISTANT.turnDeadlineMs < 120_000)
    assert.ok(ASSISTANT.turnDeadlineMs >= 100_000)
  })

  await t.test('client: an aborted deadline cancels the in-flight call and does not retry', async () => {
    const provider = hangingProvider()
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 30)
    const started = Date.now()
    await assert.rejects(client(provider).run({ ...TASK, signal: controller.signal }), (error) => {
      return isLLMError(error) && error.code === 'LLM_DEADLINE' && error.retryable === false
    })
    assert.ok(Date.now() - started < 1_000, 'should fail promptly, not wait out a per-call timeout')
    assert.equal(provider.calls, 1, 'no further attempt after the deadline')
    assert.equal(provider.abortedCalls, 1, 'the in-flight call was cancelled')
  })

  await t.test('client: no attempt starts once the deadline has passed', async () => {
    const provider = hangingProvider()
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(client(provider).run({ ...TASK, signal: controller.signal }), (error) => {
      return isLLMError(error) && error.code === 'LLM_DEADLINE'
    })
    assert.equal(provider.calls, 0)
  })

  await t.test('client: a repairable bad answer is not retried after the deadline', async () => {
    let calls = 0
    const controller = new AbortController()
    const slowInvalid: LLMProvider = {
      id: 'slow-invalid',
      modelFor: () => 'm',
      async complete() {
        calls += 1
        await new Promise((r) => setTimeout(r, 40))
        controller.abort() // the deadline passes while the bad answer arrives
        return { text: 'not json', usage: { inputTokens: 1, outputTokens: 1 }, model: 'm' }
      },
    }
    await assert.rejects(client(slowInvalid).run({ ...TASK, signal: controller.signal }), (error) => {
      return isLLMError(error) && error.code === 'LLM_DEADLINE'
    })
    assert.equal(calls, 1, 'the repair attempt was not started')
  })

  await t.test('xAI adapter: the turn signal aborts the stalled HTTP request', async () => {
    let transportAborted = false
    const transport = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          transportAborted = true
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })) as unknown as typeof fetch
    const provider = createXaiProvider({ apiKey: 'test-key-123456', modelFast: '', modelStrong: '', timeoutMs: 60_000, transport })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 30)
    const started = Date.now()
    await assert.rejects(
      provider.complete({ ...TASK, modelClass: 'strong', input: 'x', maxOutputTokens: 100, signal: controller.signal } as LLMRequest<unknown>),
      (error) => isLLMError(error) && /deadline/.test(String(error.message)),
    )
    assert.ok(transportAborted, 'the fetch itself was aborted')
    assert.ok(Date.now() - started < 1_000, 'did not wait for the 60 s per-call timeout')
  })

  await t.test('engine: a stalled model ends the turn at the deadline as a deliberate 503', async () => {
    const provider = hangingProvider()
    const started = Date.now()
    const failure = await engineWith(provider, 80).runTurn({ message: QUERY }).then(
      () => assert.fail('expected the turn to fail'),
      (error: unknown) => error,
    )
    const elapsed = Date.now() - started
    assert.ok(isLLMError(failure) && failure.code === 'LLM_DEADLINE')
    assert.ok(elapsed >= 70 && elapsed < 1_000, `ended at the deadline (${elapsed} ms)`)
    assert.equal(provider.abortedCalls, 1)

    const http = toHttpError(failure)
    assert.ok(isApiError(http))
    assert.equal(http.status, 503)
    assert.equal(http.code, 'PROVIDER_UNAVAILABLE')
    assert.match(http.message, /took too long/)
  })

  await t.test('engine: a normal turn is unaffected and leaves no timer or rejection behind', async () => {
    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onRejection)
    try {
      // A short deadline that the fast mock answer beats: if the timer were
      // not cleared, its abort would fire after the turn and surface here.
      const response = await engineWith(createMockProvider({}), 60).runTurn({ message: QUERY })
      assert.ok(response.message.length > 0)
      await new Promise((r) => setTimeout(r, 120))
      assert.deepEqual(rejections, [])
    } finally {
      process.off('unhandledRejection', onRejection)
    }
  })
})
