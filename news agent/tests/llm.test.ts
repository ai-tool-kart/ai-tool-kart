import test from 'node:test'
import assert from 'node:assert/strict'
import { createBudget } from '../src/llm/budget.ts'
import { createLLMClient, extractJson } from '../src/llm/client.ts'
import { createMockProvider } from '../src/llm/providers/mock.ts'
import { createProvider } from '../src/llm/factory.ts'
import { ClassificationSchema, EditorialReviewSchema, describeSchema } from '../src/llm/schemas.ts'
import { applyTierRules } from '../src/verification/verify.ts'
import { testEnv, testLogger } from './helpers.ts'

function client(script?: Parameters<typeof createMockProvider>[0]) {
  const budget = createBudget({ maxLlmCallsPerRun: 20, maxTokensPerRun: 1_000_000 })
  return {
    llm: createLLMClient({
      provider: createMockProvider(script ?? {}),
      budget,
      logger: testLogger(),
    }),
    budget,
  }
}

const CLASSIFY_REQUEST = {
  task: 'classify' as const,
  system: 'system instructions',
  user: 'Score this candidate story.',
  schema: ClassificationSchema,
  schemaName: 'Classification',
}

/* ── JSON recovery ────────────────────────────────────────────────────────── */

test('extractJson recovers JSON from common model wrappers', async (t) => {
  const cases: Array<[string, string, string]> = [
    ['bare object', '{"a":1}', '{"a":1}'],
    ['fenced json', '```json\n{"a":1}\n```', '{"a":1}'],
    ['fenced plain', '```\n{"a":1}\n```', '{"a":1}'],
    ['leading prose', 'Here is the result:\n{"a":1}', '{"a":1}'],
    ['trailing prose', '{"a":1}\nHope that helps!', '{"a":1}'],
    ['nested braces', '{"a":{"b":2}}', '{"a":{"b":2}}'],
    ['brace inside string', '{"a":"}{"}', '{"a":"}{"}'],
    ['escaped quote in string', '{"a":"say \\"hi\\" }"}', '{"a":"say \\"hi\\" }"}'],
  ]
  for (const [label, input, expected] of cases) {
    await t.test(label, () => {
      assert.equal(extractJson(input), expected)
    })
  }
})

/* ── Validation and repair ────────────────────────────────────────────────── */

test('valid structured output is returned as typed data', async () => {
  const { llm } = client()
  const response = await llm.run(CLASSIFY_REQUEST)

  assert.ok(response.data.relevance >= 0 && response.data.relevance <= 10)
  assert.ok(['proceed', 'skip'].includes(response.data.recommendation))
  assert.equal(response.attempts, 1)
})

test('invalid JSON is repaired on a later attempt', async () => {
  const { llm } = client({
    script: [{ kind: 'text', text: 'this is not JSON at all' }],
  })
  const response = await llm.run(CLASSIFY_REQUEST)
  // Attempt 1 failed to parse; the generated behaviour succeeded on attempt 2.
  assert.equal(response.attempts, 2)
  assert.ok(response.data.category)
})

test('schema-invalid output is repaired on a later attempt', async () => {
  const { llm } = client({
    // Wrong types and an out-of-range score.
    script: [{ kind: 'text', text: '{"relevance":"high","importance":99,"category":"nope"}' }],
  })
  const response = await llm.run(CLASSIFY_REQUEST)
  assert.equal(response.attempts, 2)
  assert.ok(response.data.relevance <= 10)
})

test('truncated output is repaired on a later attempt', async () => {
  const { llm } = client({
    script: [{ kind: 'text', text: '{"relevance": 8, "importance": 7, "categ' }],
  })
  const response = await llm.run(CLASSIFY_REQUEST)
  assert.equal(response.attempts, 2)
})

test('persistently invalid output is rejected, not accepted', async () => {
  const { llm } = client({
    script: [
      { kind: 'text', text: 'nope' },
      { kind: 'text', text: 'still nope' },
      { kind: 'text', text: 'nope again' },
    ],
  })
  await assert.rejects(() => llm.run(CLASSIFY_REQUEST), /valid JSON|validation/i)
})

test('an off-schema response can never reach the caller', async () => {
  // Extra keys are rejected by .strict(): a model going off-contract is a signal,
  // not something to silently accept.
  const { llm } = client({
    script: [
      {
        kind: 'text',
        text: JSON.stringify({
          relevance: 8, importance: 7, novelty: 6, category: 'ai-models',
          reasoning: 'ok', recommendation: 'proceed',
          // An injected instruction trying to add a field:
          publishImmediately: true,
        }),
      },
    ],
  })
  const response = await llm.run(CLASSIFY_REQUEST)
  assert.equal(response.attempts, 2, 'the off-schema response must have been rejected')
  assert.ok(!('publishImmediately' in response.data))
})

test('a refusal is retried once then surfaces as an error', async () => {
  const { llm } = client({
    script: [
      { kind: 'refusal', message: 'I cannot help with that.' },
      { kind: 'refusal', message: 'I cannot help with that.' },
      { kind: 'refusal', message: 'I cannot help with that.' },
    ],
  })
  await assert.rejects(() => llm.run(CLASSIFY_REQUEST), /declined/i)
})

test('a provider outage surfaces as an error, never as content', async () => {
  const { llm } = client({
    script: [
      { kind: 'error', message: 'ECONNRESET' },
      { kind: 'error', message: 'ECONNRESET' },
      { kind: 'error', message: 'ECONNRESET' },
    ],
  })
  await assert.rejects(() => llm.run(CLASSIFY_REQUEST), /provider call failed/i)
})

/* ── Budget ───────────────────────────────────────────────────────────────── */

test('the call budget stops spending', async () => {
  const budget = createBudget({ maxLlmCallsPerRun: 2, maxTokensPerRun: 1_000_000 })
  const llm = createLLMClient({
    provider: createMockProvider(),
    budget,
    logger: testLogger(),
  })

  await llm.run(CLASSIFY_REQUEST)
  await llm.run(CLASSIFY_REQUEST)
  assert.equal(budget.exhausted(), true)
  await assert.rejects(() => llm.run(CLASSIFY_REQUEST), /call budget exhausted/i)
})

test('the token budget stops spending', async () => {
  const budget = createBudget({ maxLlmCallsPerRun: 100, maxTokensPerRun: 10 })
  const llm = createLLMClient({ provider: createMockProvider(), budget, logger: testLogger() })

  await llm.run(CLASSIFY_REQUEST)
  assert.equal(budget.exhausted(), true)
  await assert.rejects(() => llm.run(CLASSIFY_REQUEST), /token budget exhausted/i)
})

test('usage is accumulated for the run record', async () => {
  const { llm, budget } = client()
  await llm.run(CLASSIFY_REQUEST)
  assert.equal(budget.usage.calls, 1)
  assert.ok(budget.usage.inputTokens > 0)
  assert.ok(budget.usage.outputTokens > 0)
})

/* ── Provider factory ─────────────────────────────────────────────────────── */

test('the mock provider is selected by default', () => {
  const provider = createProvider({ env: testEnv() })
  assert.equal(provider.id, 'mock')
  assert.equal(provider.modelFor('fast'), 'mock-fast-v1')
  assert.equal(provider.modelFor('strong'), 'mock-strong-v1')
})

test('an unimplemented provider fails with actionable guidance', () => {
  assert.throws(
    () =>
      createProvider({
        env: testEnv({ llm: { provider: 'some-vendor', apiKey: 'x'.repeat(20) } }),
      }),
    (error: Error) => {
      assert.match(error.message, /has no adapter/)
      assert.match(error.message, /PROVIDER_FACTORIES/, 'must say where to register an adapter')
      assert.match(error.message, /LLM_PROVIDER=mock/, 'must offer the working fallback')
      return true
    },
  )
})

test('the mock provider is deterministic', async () => {
  const first = await client().llm.run(CLASSIFY_REQUEST)
  const second = await client().llm.run(CLASSIFY_REQUEST)
  assert.deepEqual(first.data, second.data)
})

/* ── Schemas ──────────────────────────────────────────────────────────────── */

test('every task schema renders to JSON Schema for the prompt', () => {
  for (const schema of [ClassificationSchema, EditorialReviewSchema]) {
    const rendered = describeSchema(schema)
    assert.ok(rendered.includes('"properties"'), 'schema must render usable JSON Schema')
    assert.ok(rendered.length > 50)
  }
})

test('the editorial schema rejects an out-of-range confidence', () => {
  const result = EditorialReviewSchema.safeParse({
    verdict: 'approved',
    confidence: 1.5,
    issues: [],
    notes: '',
  })
  assert.equal(result.success, false)
})

/* ── Deterministic tier rules over the verifier ───────────────────────────── */

test('tier rules downgrade a model verdict the evidence does not justify', async (t) => {
  await t.test('pricing needs Tier 1 even if the model says verified', () => {
    assert.equal(applyTierRules('pricing', 'verified', [2, 2], ['a', 'b']), 'single-source')
  })
  await t.test('pricing from Tier 1 stays verified', () => {
    assert.equal(applyTierRules('pricing', 'verified', [1], ['a']), 'verified')
  })
  await t.test('capability needs Tier 1', () => {
    assert.equal(applyTierRules('capability', 'verified', [2], ['a']), 'single-source')
  })
  await t.test('a launch is verified by two independent Tier 2 sources', () => {
    assert.equal(applyTierRules('launch', 'verified', [2, 2], ['a', 'b']), 'verified')
  })
  await t.test('Tier 3 alone is never support', () => {
    assert.equal(applyTierRules('other', 'verified', [3, 3], ['a', 'b']), 'unsupported')
  })
  await t.test('no supporting URLs means unsupported regardless of verdict', () => {
    assert.equal(applyTierRules('launch', 'verified', [], []), 'unsupported')
  })
  await t.test('the rules never upgrade a negative verdict', () => {
    assert.equal(applyTierRules('launch', 'unsupported', [1], ['a']), 'unsupported')
    assert.equal(applyTierRules('pricing', 'conflicting', [1], ['a']), 'conflicting')
  })
})
