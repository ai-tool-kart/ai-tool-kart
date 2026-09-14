/*
 * Scheduled-automation safety.
 *
 * Everything here exists because the agent is about to run unattended on a
 * timer. Unattended changes the cost of every failure mode: a bug that wastes
 * one manual run wastes six a day forever, and a safety property that holds
 * "because you would notice" holds no longer.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { executePipeline } from '../src/pipeline/run.ts'
import { loadEnv } from '../src/config/env.ts'
import { formatRunSummary } from '../src/pipeline/summary.ts'
import { runHealthCheck } from '../src/health.ts'
import { clearSecrets, createLogger } from '../src/utils/logger.ts'
import {
  fixtureFeedFetcher,
  fixturePageFetcher,
  mockWordPress,
  TEST_CLOCK,
  TEST_SOURCES,
  testEnv,
  testLogger,
  testRepos,
} from './helpers.ts'

const FEEDS = fixtureFeedFetcher({ 'vendor-news': 'feed-tier1.xml', 'techpress-ai': 'feed-tier2.xml' })
const PAGES = fixturePageFetcher([
  ['vendor.example.com/news/aurora-2', 'article-tier1.html'],
  ['techpress.example.com/2026/08/20/aurora-2-launch', 'article-tier2.html'],
  ['vendor.example.com/news/safety-docs', 'article-tier1.html'],
])

function harness() {
  return { repos: testRepos(), wp: mockWordPress() }
}

async function run(h: ReturnType<typeof harness>, overrides: Record<string, unknown> = {}) {
  return executePipeline({
    env: testEnv(),
    repos: h.repos,
    logger: testLogger(),
    dryRun: false,
    sources: TEST_SOURCES,
    ingest: { fetchFeed: FEEDS },
    gather: { fetchPage: PAGES },
    wordPressClient: h.wp,
    clock: TEST_CLOCK,
    ...overrides,
  })
}

/* ── kill switch ──────────────────────────────────────────────────────────── */

test('AGENT_ENABLED defaults to true so an unset variable never pauses production', () => {
  clearSecrets()
  const { env } = loadEnv({ AGENT_DB_PATH: ':memory:' } as NodeJS.ProcessEnv)
  assert.equal(env.enabled, true)
})

test('AGENT_ENABLED=false is parsed as disabled', async (t) => {
  for (const value of ['false', '0', 'no']) {
    await t.test(value, () => {
      clearSecrets()
      const { env } = loadEnv({ AGENT_DB_PATH: ':memory:', AGENT_ENABLED: value } as NodeJS.ProcessEnv)
      assert.equal(env.enabled, false)
    })
  }
})

test('a disabled agent reports itself in the health check without failing', async () => {
  const report = await runHealthCheck({
    env: testEnv({ enabled: false }),
    logger: testLogger(),
  })
  const killSwitch = report.checks.find((check) => check.name === 'kill-switch')
  assert.ok(killSwitch, 'a disabled agent must say so')
  assert.equal(killSwitch.status, 'warn', 'paused is not broken')
})

/* ── auto-publish stays impossible ────────────────────────────────────────── */

test('auto-publish cannot be enabled, however the variable is spelled', async (t) => {
  for (const value of ['true', '1', 'yes']) {
    await t.test(value, () => {
      clearSecrets()
      assert.throws(
        () => loadEnv({ AGENT_DB_PATH: ':memory:', AGENT_AUTO_PUBLISH: value } as NodeJS.ProcessEnv),
        /not implemented/i,
      )
    })
  }
})

test('every WordPress write a scheduled run makes is a draft', async () => {
  const h = harness()
  await run(h)
  assert.ok(h.wp.created.length >= 1)
  for (const payload of h.wp.created) {
    assert.equal(payload.status, 'draft', 'automation must never publish')
  }
})

test('no featured image is ever attached', async () => {
  // Images are a deferred milestone. The frontend relies on its own fallback for
  // posts without one, so an accidental featured_media would be a real change.
  const h = harness()
  await run(h)
  for (const payload of h.wp.created) {
    assert.ok(
      !('featured_media' in (payload as unknown as Record<string, unknown>)),
      'featured_media must not appear in a post payload',
    )
  }
})

/* ── run locking ──────────────────────────────────────────────────────────── */

test('an overlapping scheduled trigger exits cleanly instead of running twice', async () => {
  const h = harness()

  // Simulate a run still in flight: claim the lock and leave it held.
  const first = h.repos.runs.claimLock(
    {
      id: 'run_in_flight',
      startedAt: new Date().toISOString(),
      status: 'running',
      dryRun: false,
      counters: {
        sourcesChecked: 0, sourcesFailed: 0, itemsDiscovered: 0, itemsDuplicate: 0,
        itemsRejected: 0, storiesCandidate: 0, storiesVerified: 0, articlesGenerated: 0,
        articlesApproved: 0, draftsCreated: 0, pendingRetried: 0, seoBriefsCreated: 0,
        storiesDeferred: 0,
      },
      llmUsage: { calls: 0, inputTokens: 0, outputTokens: 0 },
      errors: [],
    },
    30,
  )
  assert.equal(first.acquired, true)

  const { run: second, exitCode } = await run(h)

  assert.equal(second.status, 'skipped', 'the overlapping trigger must not run the pipeline')
  assert.equal(exitCode, 0, 'a skipped run is not a scheduler failure')
  assert.equal(second.counters.articlesGenerated, 0)
  assert.equal(h.wp.created.length, 0, 'no concurrent WordPress writes')
  assert.match(second.note ?? '', /run_in_flight/)
})

/* ── a quiet run is a success ─────────────────────────────────────────────── */

test('a run that qualifies no story exits 0 with zero drafts', async () => {
  const h = harness()
  const { run: result, exitCode } = await run(h, {
    mock: { classifyAsIrrelevant: true },
  })

  assert.equal(exitCode, 0, 'no news is not an error')
  assert.equal(result.status, 'completed')
  assert.equal(result.counters.draftsCreated, 0)
  assert.equal(h.wp.created.length, 0)
})

test('a dead source does not stop the run', async () => {
  const h = harness()
  const { run: result, exitCode } = await run(h, {
    ingest: {
      fetchFeed: async (source: { id: string }) => {
        if (source.id === 'vendor-news') throw new Error('feed down')
        return FEEDS({ id: 'techpress-ai' } as never)
      },
    },
  })

  assert.equal(exitCode, 0)
  assert.equal(result.status, 'completed')
  assert.equal(result.counters.sourcesFailed, 1)
  assert.ok(result.counters.sourcesChecked > result.counters.sourcesFailed, 'the rest still ran')
})

/* ── run summary ──────────────────────────────────────────────────────────── */

test('the run summary carries every field an operator needs and no secrets', async () => {
  const h = harness()
  const { run: result } = await run(h)
  const summary = formatRunSummary(result)

  for (const field of [
    'run=', 'status=', 'sources=', 'items=', 'duplicates=', 'rejected=', 'candidates=',
    'verified=', 'seo=', 'generated=', 'approved=', 'drafts=', 'retried=', 'deferred=',
    'llm_calls=', 'tokens=', 'errors=',
  ]) {
    assert.ok(summary.includes(field), `summary must report ${field}`)
  }
  assert.ok(!/password|authorization|sk-|Bearer/i.test(summary), 'the summary must carry no credential')
})

test('a run persists its summary for the next invocation to read', async () => {
  const h = harness()
  const { run: result } = await run(h)
  const persisted = h.repos.runs.listRecent(1)[0]
  assert.ok(persisted, 'the run must be persisted')
  assert.equal(persisted.id, result.id)
  assert.equal(persisted.status, 'completed')
  assert.ok(persisted.finishedAt, 'a terminated run records when it finished')
})

/* ── secrets never reach the log ──────────────────────────────────────────── */

test('a scheduled run logs no credential even at debug level', async () => {
  clearSecrets()
  const lines: string[] = []
  const logger = createLogger({
    level: 'debug',
    format: 'json',
    write: (line) => lines.push(line),
  })

  const h = harness()
  await executePipeline({
    env: testEnv(),
    repos: h.repos,
    logger,
    dryRun: false,
    sources: TEST_SOURCES,
    ingest: { fetchFeed: FEEDS },
    gather: { fetchPage: PAGES },
    wordPressClient: h.wp,
    clock: TEST_CLOCK,
  })

  const output = lines.join('\n')
  assert.ok(lines.length > 0, 'the run should have logged something')
  assert.ok(!/Authorization|Basic [A-Za-z0-9+/=]{8}|Bearer [A-Za-z0-9._-]{8}/i.test(output))
  assert.ok(!/sk-[a-zA-Z0-9]{8}/.test(output))
})
