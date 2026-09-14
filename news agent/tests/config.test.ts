/*
 * Run/cost cap configuration semantics.
 *
 * These exist because of a real incident: an operator set
 * AGENT_MAX_CANDIDATES_PER_RUN=0 and AGENT_MAX_STORIES_VERIFIED_PER_RUN=0
 * intending a no-op run, and got the DEFAULT workload instead — 20 candidates,
 * 5 verifications, a full article generated and posted. The old parser was
 * `z.coerce.number().int().positive().catch(fallback)`, so 0 failed `.positive()`
 * and `.catch()` silently substituted the default.
 *
 * A cost control that fails OPEN — expanding to the full default workload at the
 * exact moment someone was trying to restrict it — is the failure mode these
 * tests exist to make impossible.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadEnv } from '../src/config/env.ts'
import { clearSecrets } from '../src/utils/logger.ts'

const BASE = { AGENT_DB_PATH: ':memory:' } as NodeJS.ProcessEnv

function load(overrides: Record<string, string> = {}) {
  clearSecrets()
  return loadEnv({ ...BASE, ...overrides } as NodeJS.ProcessEnv).env
}

const CAP_VARS = [
  'AGENT_MAX_ITEMS_PER_SOURCE_PER_RUN',
  'AGENT_MAX_CANDIDATES_PER_RUN',
  'AGENT_MAX_STORIES_VERIFIED_PER_RUN',
  'AGENT_MAX_ARTICLES_PER_RUN',
  'AGENT_MAX_LLM_CALLS_PER_RUN',
  'AGENT_MAX_TOKENS_PER_RUN',
] as const

/* ── the regression itself ────────────────────────────────────────────────── */

test('an explicit zero cap can never expand into the default workload', async (t) => {
  // The defaults each cap would take if the zero were silently dropped. If any
  // assertion below reads one of these numbers, the footgun is back.
  const defaults: Record<string, number> = {
    AGENT_MAX_ITEMS_PER_SOURCE_PER_RUN: 25,
    AGENT_MAX_CANDIDATES_PER_RUN: 20,
    AGENT_MAX_STORIES_VERIFIED_PER_RUN: 5,
    AGENT_MAX_ARTICLES_PER_RUN: 2,
    AGENT_MAX_LLM_CALLS_PER_RUN: 60,
    AGENT_MAX_TOKENS_PER_RUN: 250_000,
  }
  const read: Record<string, (limits: ReturnType<typeof load>['limits']) => number> = {
    AGENT_MAX_ITEMS_PER_SOURCE_PER_RUN: (l) => l.maxItemsPerSourcePerRun,
    AGENT_MAX_CANDIDATES_PER_RUN: (l) => l.maxCandidatesPerRun,
    AGENT_MAX_STORIES_VERIFIED_PER_RUN: (l) => l.maxStoriesVerifiedPerRun,
    AGENT_MAX_ARTICLES_PER_RUN: (l) => l.maxArticlesPerRun,
    AGENT_MAX_LLM_CALLS_PER_RUN: (l) => l.maxLlmCallsPerRun,
    AGENT_MAX_TOKENS_PER_RUN: (l) => l.maxTokensPerRun,
  }

  for (const name of CAP_VARS) {
    await t.test(`${name}=0 means zero`, () => {
      const limits = load({ [name]: '0' }).limits
      const actual = read[name]!(limits)
      assert.equal(actual, 0, `${name}=0 must mean zero`)
      assert.notEqual(actual, defaults[name], `${name}=0 must not become the default`)
    })
  }
})

test('every cap set to zero yields an entirely zeroed budget', () => {
  const limits = load(Object.fromEntries(CAP_VARS.map((name) => [name, '0']))).limits
  assert.deepEqual(limits, {
    maxItemsPerSourcePerRun: 0,
    maxCandidatesPerRun: 0,
    maxStoriesVerifiedPerRun: 0,
    maxArticlesPerRun: 0,
    maxLlmCallsPerRun: 0,
    maxTokensPerRun: 0,
  })
})

/* ── defaults still apply where nothing was configured ────────────────────── */

test('an unset or blank cap still takes its documented default', async (t) => {
  await t.test('unset', () => {
    assert.equal(load().limits.maxCandidatesPerRun, 20)
  })
  await t.test('blank', () => {
    assert.equal(load({ AGENT_MAX_CANDIDATES_PER_RUN: '' }).limits.maxCandidatesPerRun, 20)
  })
  await t.test('whitespace only', () => {
    assert.equal(load({ AGENT_MAX_CANDIDATES_PER_RUN: '   ' }).limits.maxCandidatesPerRun, 20)
  })
})

/* ── unusable values fail loudly instead of defaulting ────────────────────── */

test('a cap that is present but unusable is rejected at startup', async (t) => {
  const bad: Array<[string, string]> = [
    ['negative', '-5'],
    ['fractional', '2.5'],
    ['not a number', 'abc'],
    ['empty-ish garbage', 'null'],
  ]

  for (const [label, value] of bad) {
    await t.test(label, () => {
      assert.throws(
        () => load({ AGENT_MAX_CANDIDATES_PER_RUN: value }),
        (error: Error) => {
          assert.match(error.message, /Invalid agent environment/)
          assert.match(
            error.message,
            /AGENT_MAX_CANDIDATES_PER_RUN/,
            'the error must name the offending variable',
          )
          return true
        },
        `${label} must be rejected, not silently replaced by the default`,
      )
    })
  }
})

test('a rejected cap never reaches the pipeline as a default', () => {
  // The dangerous outcome is not "an error message" but "a run that spends the
  // default budget". Prove nothing is returned at all.
  let limits: unknown
  try {
    limits = load({ AGENT_MAX_TOKENS_PER_RUN: '-1' }).limits
  } catch {
    limits = undefined
  }
  assert.equal(limits, undefined, 'an invalid cap must abort startup, not yield limits')
})

/* ── operational settings where zero is meaningless ───────────────────────── */

test('zero is rejected for settings where it would break every request', async (t) => {
  // A 0ms timeout or a 0-byte response cap does not limit work, it prevents all
  // of it — so these keep a strictly-positive contract.
  const cases: Array<[string, string]> = [
    ['AGENT_HTTP_TIMEOUT_MS', '0'],
    ['AGENT_MAX_RESPONSE_BYTES', '0'],
    ['AGENT_RUN_LOCK_STALE_MINUTES', '0'],
  ]
  for (const [name, value] of cases) {
    await t.test(name, () => {
      assert.throws(() => load({ [name]: value }), new RegExp(name))
    })
  }
})

test('operational settings still accept sane values and defaults', () => {
  assert.equal(load({ AGENT_HTTP_TIMEOUT_MS: '9000' }).http.timeoutMs, 9000)
  assert.equal(load().http.timeoutMs, 15_000)
})

/* ── the selection threshold got the same treatment ───────────────────────── */

test('the weighted-score threshold fails loudly rather than defaulting', () => {
  assert.equal(load({ AGENT_MIN_WEIGHTED_SCORE: '0' }).minWeightedScore, 0)
  assert.equal(load({ AGENT_MIN_WEIGHTED_SCORE: '7.5' }).minWeightedScore, 7.5)
  assert.equal(load().minWeightedScore, 6)
  assert.throws(() => load({ AGENT_MIN_WEIGHTED_SCORE: '11' }), /AGENT_MIN_WEIGHTED_SCORE/)
  assert.throws(() => load({ AGENT_MIN_WEIGHTED_SCORE: 'high' }), /AGENT_MIN_WEIGHTED_SCORE/)
})
