/*
 * The demo dashboard's safety gate and state folding.
 *
 * The gate is the load-bearing test here. The agent's own .env legitimately
 * points at the production CMS, so "the demo inherits .env" is the default
 * state of the world — and a demo that quietly published a test article to the
 * live blog would be the worst possible outcome of this feature. These cases
 * pin the refusal.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadEnv } from '../src/config/env.ts'
import { clearSecrets } from '../src/utils/logger.ts'
import {
  assertSafeToPublish,
  describeEnvironment,
  editorUrlFor,
  siteRootFrom,
} from '../src/demo/environment.ts'
import { applyEvent, emptyRunState, markFailed, focusStory } from '../src/demo/state.ts'
import type { PipelineEvent } from '../src/pipeline/observer.ts'
import { emptyCounters, emptyUsage } from '../src/domain/types.ts'

const BASE = { AGENT_DB_PATH: ':memory:' } as NodeJS.ProcessEnv

function envWith(overrides: Record<string, string> = {}) {
  clearSecrets()
  return loadEnv({ ...BASE, ...overrides } as NodeJS.ProcessEnv).env
}

const LOCAL_WP = {
  WORDPRESS_API_URL: 'http://ai-tool-kart-cms.local/wp-json/wp/v2',
  WORDPRESS_USERNAME: 'aitoolkart-news-agent',
  WORDPRESS_APP_PASSWORD: 'abcd efgh ijkl mnop qrst uvwx',
}

const PRODUCTION_WP = {
  WORDPRESS_API_URL: 'https://blog.aitoolkart.com/wp-json/wp/v2',
  WORDPRESS_USERNAME: 'agent',
  WORDPRESS_APP_PASSWORD: 'abcd efgh ijkl mnop qrst uvwx',
}

/* ── the environment gate ─────────────────────────────────────────────────── */

test('a production WordPress URL blocks the demo run', () => {
  const descriptor = describeEnvironment(envWith(PRODUCTION_WP), [])
  assert.equal(descriptor.wordpress.locality, 'remote')
  assert.equal(descriptor.canRun, false)
  assert.match(descriptor.blockedReason as string, /not a local development host/)

  const gate = assertSafeToPublish(envWith(PRODUCTION_WP))
  assert.equal(gate.ok, false)
})

test('a LocalWP .local host is allowed', () => {
  const descriptor = describeEnvironment(envWith(LOCAL_WP), [])
  assert.equal(descriptor.wordpress.locality, 'local')
  assert.equal(descriptor.canRun, true)
  assert.equal(descriptor.blockedReason, undefined)
  assert.equal(assertSafeToPublish(envWith(LOCAL_WP)).ok, true)
})

test('localhost and 127.0.0.1 are allowed; a public https host is not', () => {
  for (const host of ['http://localhost:8080/wp-json/wp/v2', 'http://127.0.0.1/wp-json/wp/v2']) {
    const descriptor = describeEnvironment(envWith({ ...LOCAL_WP, WORDPRESS_API_URL: host }), [])
    assert.equal(descriptor.canRun, true, host)
  }
  const remote = describeEnvironment(
    envWith({ ...PRODUCTION_WP, WORDPRESS_API_URL: 'https://cms.example.com/wp-json/wp/v2' }),
    [],
  )
  assert.equal(remote.canRun, false)
})

test('an unconfigured CMS blocks publishing but is not reported as remote', () => {
  const descriptor = describeEnvironment(envWith(), [])
  assert.equal(descriptor.wordpress.locality, 'not-configured')
  assert.equal(descriptor.canRun, false)
  assert.equal(descriptor.dryRunOnly, true)
})

test('the environment descriptor never carries a credential', () => {
  const descriptor = describeEnvironment(envWith(LOCAL_WP), [])
  const serialised = JSON.stringify(descriptor)
  assert.ok(!serialised.includes('abcd'), 'application password leaked into the descriptor')
  assert.ok(!serialised.includes('uvwx'), 'application password leaked into the descriptor')
  // Presence is reported, the key itself is not.
  assert.equal(typeof descriptor.llm.apiKeyConfigured, 'boolean')
  assert.ok(!('apiKey' in descriptor.llm))
})

/* ── URL derivation ───────────────────────────────────────────────────────── */

test('the site root and editor URL are derived from the REST base', () => {
  assert.equal(
    siteRootFrom('http://ai-tool-kart-cms.local/wp-json/wp/v2'),
    'http://ai-tool-kart-cms.local',
  )
  // A subdirectory install keeps its prefix.
  assert.equal(siteRootFrom('http://localhost/blog/wp-json/wp/v2'), 'http://localhost/blog')
  assert.equal(
    editorUrlFor('http://ai-tool-kart-cms.local/wp-json/wp/v2', 42),
    'http://ai-tool-kart-cms.local/wp-admin/post.php?post=42&action=edit',
  )
})

/* ── state folding ────────────────────────────────────────────────────────── */

function stateFor(events: PipelineEvent[]) {
  const state = emptyRunState('run-1', '2026-09-14T10:00:00.000Z', false)
  for (const event of events) applyEvent(state, event)
  return state
}

test('stages start as waiting and only advance when the pipeline says so', () => {
  const state = emptyRunState('run-1', '2026-09-14T10:00:00.000Z', false)
  assert.ok(state.stages.every((stage) => stage.status === 'waiting'))

  applyEvent(state, {
    type: 'stage',
    at: '2026-09-14T10:00:01.000Z',
    stage: 'discovery',
    status: 'running',
  })
  assert.equal(state.stages.find((stage) => stage.id === 'discovery')?.status, 'running')
  assert.equal(state.stages.find((stage) => stage.id === 'dedupe')?.status, 'waiting')
})

test('a finished run settles every stage that never ran', () => {
  const state = stateFor([
    { type: 'stage', at: 't', stage: 'discovery', status: 'running' },
    { type: 'stage', at: 't', stage: 'discovery', status: 'completed' },
    {
      type: 'run:finished',
      at: '2026-09-14T10:05:00.000Z',
      status: 'completed',
      counters: emptyCounters(),
      llmUsage: emptyUsage(),
      errors: [],
    },
  ])

  assert.equal(state.status, 'completed')
  // Never-started stages are "skipped", not silently left as "waiting".
  assert.equal(state.stages.find((stage) => stage.id === 'selection')?.status, 'skipped')
  assert.ok(state.summary, 'a finished run always has a summary')
})

test('a stage left running when the run dies is reported failed, not waiting', () => {
  const state = stateFor([
    { type: 'stage', at: 't', stage: 'discovery', status: 'running' },
  ])
  markFailed(state, 'LLM provider call failed', 'Check news agent/.env.demo.')

  assert.equal(state.status, 'failed')
  assert.equal(state.stages.find((stage) => stage.id === 'discovery')?.status, 'failed')
  assert.equal(state.failure?.message, 'LLM provider call failed')
})

test('the summary counts only what the pipeline reported', () => {
  const state = stateFor([
    {
      type: 'ingest:completed',
      at: 't',
      sourcesChecked: 10,
      sourcesFailed: 1,
      itemsDiscovered: 160,
      droppedBeforePersist: 4,
    },
    {
      type: 'story:verification',
      at: 't',
      storyId: 'sty_1',
      claims: [],
      sufficient: true,
      counts: { verified: 11, singleSource: 0, unsupported: 12, conflicting: 0 },
    },
    {
      type: 'run:finished',
      at: 't',
      status: 'completed',
      counters: emptyCounters(),
      llmUsage: { calls: 17, inputTokens: 40000, outputTokens: 5966 },
      errors: [],
    },
  ])

  assert.equal(state.summary?.sourcesChecked, 10)
  assert.equal(state.summary?.claimsVerified, 11)
  assert.equal(state.summary?.claimsUnsupported, 12)
  assert.equal(state.summary?.llmCalls, 17)
  assert.equal(state.summary?.llmTokens, 45966)
  // No article was generated, so no word count is invented.
  assert.equal(state.summary?.articleWords, undefined)
  assert.equal(state.summary?.wordpressStatus, 'Not reached')
})

test('the focused story is the one that got furthest', () => {
  const state = stateFor([
    { type: 'stage', at: 't', stage: 'evidence', status: 'completed', storyId: 'sty_shallow' },
    { type: 'stage', at: 't', stage: 'evidence', status: 'completed', storyId: 'sty_deep' },
    { type: 'stage', at: 't', stage: 'claims', status: 'completed', storyId: 'sty_deep' },
    { type: 'stage', at: 't', stage: 'verification', status: 'completed', storyId: 'sty_deep' },
  ])
  assert.equal(focusStory(state)?.storyId, 'sty_deep')
})

test('log lines are retained in order and bounded', () => {
  const events: PipelineEvent[] = []
  for (let index = 0; index < 500; index += 1) {
    events.push({ type: 'log', at: 't', level: 'info', message: `line ${index}` })
  }
  const state = stateFor(events)
  assert.ok(state.logs.length <= 400, 'the log buffer must not grow without bound')
  assert.equal(state.logs[state.logs.length - 1]?.message, 'line 499')
})
