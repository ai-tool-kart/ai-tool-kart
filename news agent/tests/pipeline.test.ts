import test from 'node:test'
import assert from 'node:assert/strict'
import { executePipeline } from '../src/pipeline/run.ts'
import {
  fixtureFeedFetcher,
  fixturePageFetcher,
  mockWordPress,
  TEST_SOURCES,
  testEnv,
  testLogger,
  testRepos,
  TEST_CLOCK,
  clockHoursAfterFixtures,
} from './helpers.ts'
import type { Repositories } from '../src/storage/repositories.ts'

/*
 * The end-to-end test NEWS_AGENT.md §33 calls for: fixture feed -> ingestion ->
 * dedupe -> mock classifier -> fixture evidence -> mock verification -> mock
 * writer -> mock editor -> WordPress mock draft.
 *
 * It is the only test that proves the contracts between steps still line up, so
 * it asserts on the whole chain rather than on any one module.
 */

const FEEDS = fixtureFeedFetcher({
  'vendor-news': 'feed-tier1.xml',
  'techpress-ai': 'feed-tier2.xml',
})

const PAGES = fixturePageFetcher([
  ['vendor.example.com/news/aurora-2', 'article-tier1.html'],
  ['techpress.example.com/2026/08/20/aurora-2-launch', 'article-tier2.html'],
  ['vendor.example.com/news/safety-docs', 'article-tier1.html'],
])

interface RunHarness {
  repos: Repositories
  wp: ReturnType<typeof mockWordPress>
}

function harness(): RunHarness {
  return { repos: testRepos(), wp: mockWordPress() }
}

async function runPipeline(h: RunHarness, overrides: Record<string, unknown> = {}) {
  return executePipeline({
    env: testEnv(),
    repos: h.repos,
    logger: testLogger(),
    dryRun: false,
    sources: TEST_SOURCES,
    ingest: { fetchFeed: FEEDS },
    gather: { fetchPage: PAGES },
    wordPressClient: h.wp,
    // Pinned editorial clock: the fixtures carry absolute publication dates, so
    // without this the production staleness gate would reject them as the real
    // date moved on, and every stage below the prefilter would go untested.
    clock: TEST_CLOCK,
    ...overrides,
  })
}

test('end to end: fixture feeds produce a WordPress draft', async () => {
  const h = harness()
  const { run, exitCode } = await runPipeline(h)

  assert.equal(exitCode, 0)
  assert.equal(run.status, 'completed')
  assert.equal(run.counters.sourcesChecked, 2)
  assert.equal(run.counters.sourcesFailed, 0)
  assert.ok(run.counters.itemsDiscovered > 0, 'should have ingested items')
  assert.ok(run.counters.draftsCreated >= 1, 'should have created at least one draft')

  const post = h.wp.created[0]
  assert.ok(post, 'a post payload should have been sent')

  // The draft-only policy, asserted at the payload boundary.
  assert.equal(post.status, 'draft')

  assert.ok(post.title.length > 10, 'title should be substantive')
  assert.ok(post.excerpt.length >= 80, 'excerpt must be written, not truncated')
  assert.ok(post.slug.length > 0 && /^[a-z0-9-]+$/.test(post.slug), `slug "${post.slug}" must be URL-safe`)
  assert.equal(post.categories.length, 1, 'exactly one real category (frontend depends on it)')
  assert.ok(post.tags.length >= 1, 'should carry entity tags')
  assert.ok(post.content.includes('<h2>Sources</h2>'), 'must include a visible Sources block')

  h.repos.close()
})

test('the same event from two publications becomes ONE story', async () => {
  const h = harness()
  await runPipeline(h)

  // Both feeds carry the Aurora 2 launch; it must not become two articles.
  const aurora = h.wp.created.filter((post) => post.title.toLowerCase().includes('aurora 2'))
  assert.ok(aurora.length <= 1, `Aurora 2 produced ${aurora.length} posts; expected at most 1`)

  h.repos.close()
})

test('rerunning the pipeline creates no duplicate drafts', async () => {
  const h = harness()

  const first = await runPipeline(h)
  const afterFirst = h.wp.created.length
  assert.ok(afterFirst >= 1, 'first run should publish')

  const second = await runPipeline(h)

  assert.equal(second.exitCode, 0)
  assert.equal(
    h.wp.created.length,
    afterFirst,
    'second run must not create additional WordPress posts',
  )
  // Everything was already seen, so nothing new is persisted.
  assert.equal(second.run.counters.draftsCreated, 0)
  assert.equal(
    second.run.counters.itemsDiscovered,
    first.run.counters.itemsDiscovered,
    'the same feed content is re-fetched',
  )
  assert.ok(
    second.run.counters.itemsDuplicate >= first.run.counters.itemsDiscovered,
    `every re-fetched item should be recognised as a duplicate ` +
      `(saw ${second.run.counters.itemsDuplicate})`,
  )

  h.repos.close()
})

test('a crash after WordPress responded does not duplicate on the next run', async () => {
  const h = harness()
  await runPipeline(h)

  const published = h.repos.articles.listPublishedTitles(10)
  assert.ok(published.length >= 1, 'expected a published article record')

  const article = h.repos.articles.findByStory(published[0]!.storyId)
  assert.ok(article?.wpPostId, 'wp_post_id must be persisted immediately after creation')

  // The repository refuses to overwrite an existing post id — the guarantee that
  // makes a re-attempt safe rather than duplicating.
  assert.throws(
    () => h.repos.articles.recordWordPressPost(article!.id, 99999),
    /Refused to overwrite/,
    'a second recording attempt must be rejected',
  )

  const before = h.wp.created.length
  await runPipeline(h)
  assert.equal(h.wp.created.length, before, 'rerun after a recorded post must not republish')

  h.repos.close()
})

test('dry run never writes to WordPress', async () => {
  const h = harness()
  const { run, exitCode } = await runPipeline(h, { dryRun: true })

  assert.equal(exitCode, 0)
  assert.equal(run.dryRun, true)
  assert.equal(h.wp.created.length, 0, 'dry run must not create any WordPress post')
  // The rest of the pipeline still ran.
  assert.ok(run.counters.itemsDiscovered > 0)
  assert.ok(run.counters.articlesGenerated >= 1, 'dry run should still generate drafts')

  h.repos.close()
})

/*
 * The counterpart to the pinned clock in runPipeline(): the fixtures are only
 * fresh *because* the run is placed next to them. Move the run far enough
 * forward and the same fixtures must be thrown away as stale, all the way
 * through the real pipeline. This is what stops the staleness gate from being
 * quietly weakened the next time a fixture rots.
 */
test('the same fixtures are rejected as stale once the run moves past the window', async () => {
  const h = harness()
  const { run, exitCode } = await runPipeline(h, {
    clock: clockHoursAfterFixtures(24 * 30),
  })

  assert.equal(exitCode, 0, 'stale input is a normal outcome, not a run failure')
  assert.equal(run.status, 'completed')
  assert.ok(run.counters.itemsDiscovered > 0, 'the items are still ingested')
  assert.equal(run.counters.articlesGenerated, 0, 'nothing may be written from stale news')
  assert.equal(h.wp.created.length, 0, 'no draft may be created from stale news')

  const rejected = h.repos.stories.listByStatus('rejected')
  assert.ok(
    rejected.some((story) => /stale/.test(story.rejectionReason ?? '')),
    'the staleness rejection must be recorded, not silent',
  )

  h.repos.close()
})

test('a failing source does not stop the run', async () => {
  const h = harness()
  const { run, exitCode } = await runPipeline(h, {
    ingest: {
      fetchFeed: async (source: { id: string }) => {
        if (source.id === 'vendor-news') throw new Error('connection reset')
        return FEEDS({ id: 'techpress-ai' } as never)
      },
    },
  })

  assert.equal(exitCode, 0)
  assert.equal(run.status, 'completed')
  assert.equal(run.counters.sourcesFailed, 1)
  assert.ok(run.counters.itemsDiscovered > 0, 'the surviving source should still yield items')

  h.repos.close()
})

test('a malformed feed is a source failure, not a run failure', async () => {
  const h = harness()
  const { run, exitCode } = await runPipeline(h, {
    ingest: { fetchFeed: fixtureFeedFetcher({ 'vendor-news': 'feed-malformed.xml', 'techpress-ai': 'feed-tier2.xml' }) },
  })

  assert.equal(exitCode, 0)
  assert.equal(run.status, 'completed')
  assert.equal(run.counters.sourcesFailed, 1)

  h.repos.close()
})

test('the run lock prevents a concurrent run', async () => {
  const h = harness()

  // Claim the lock and leave it held.
  const held = h.repos.runs.claimLock(
    {
      id: 'run_held',
      startedAt: new Date().toISOString(),
      status: 'running',
      dryRun: false,
      counters: {
        sourcesChecked: 0, sourcesFailed: 0, itemsDiscovered: 0, itemsDuplicate: 0,
        itemsRejected: 0, storiesCandidate: 0, storiesVerified: 0, articlesGenerated: 0,
        articlesApproved: 0, draftsCreated: 0, pendingRetried: 0, seoBriefsCreated: 0, storiesDeferred: 0,
      },
      llmUsage: { calls: 0, inputTokens: 0, outputTokens: 0 },
      errors: [],
    },
    30,
  )
  assert.equal(held.acquired, true)

  const { run, exitCode } = await runPipeline(h)
  assert.equal(run.status, 'skipped')
  assert.equal(exitCode, 0, 'a skipped run is not a failure')
  assert.match(run.note ?? '', /run_held/)
  assert.equal(h.wp.created.length, 0)

  h.repos.close()
})

test('a stale lock is reclaimed', async () => {
  const h = harness()
  const stale = new Date(Date.now() - 120 * 60_000).toISOString()

  h.repos.runs.claimLock(
    {
      id: 'run_stale',
      startedAt: stale,
      status: 'running',
      dryRun: false,
      counters: {
        sourcesChecked: 0, sourcesFailed: 0, itemsDiscovered: 0, itemsDuplicate: 0,
        itemsRejected: 0, storiesCandidate: 0, storiesVerified: 0, articlesGenerated: 0,
        articlesApproved: 0, draftsCreated: 0, pendingRetried: 0, seoBriefsCreated: 0, storiesDeferred: 0,
      },
      llmUsage: { calls: 0, inputTokens: 0, outputTokens: 0 },
      errors: [],
    },
    30,
  )

  const { run } = await runPipeline(h)
  assert.equal(run.status, 'completed', 'a lock older than the stale threshold must be reclaimed')

  const reclaimed = h.repos.runs.get('run_stale')
  assert.equal(reclaimed?.status, 'failed', 'the crashed run should be marked failed')

  h.repos.close()
})

test('WordPress being unavailable defers rather than losing the draft', async () => {
  const h = { repos: testRepos(), wp: mockWordPress({ alwaysFail: new Error('ECONNREFUSED') }) }
  const { run, exitCode } = await runPipeline(h)

  assert.equal(exitCode, 0, 'a CMS outage is not a run failure')
  assert.equal(h.wp.created.length, 0)
  assert.equal(run.counters.draftsCreated, 0)

  // The approved draft survives for a later run.
  const pending = h.repos.articles.listAwaitingPublication()
  assert.ok(pending.length >= 1, 'approved draft must be retained when WordPress is down')
  assert.equal(pending[0]?.wpPostId, undefined)

  h.repos.close()
})

test('rejected drafts are persisted for tuning, not sent to WordPress', async () => {
  const h = harness()
  await runPipeline(h, { mock: { editorVerdict: 'rejected' } })

  assert.equal(h.wp.created.length, 0, 'a rejected draft must never reach WordPress')

  const stories = h.repos.stories.listByStatus('generated')
  assert.ok(stories.length >= 1, 'the story should be recorded as generated but unapproved')

  const article = h.repos.articles.findByStory(stories[0]!.id)
  assert.ok(article, 'the rejected draft must still be stored')
  assert.equal(article?.editorialStatus, 'rejected')
  assert.ok((article?.editorialIssues?.length ?? 0) > 0, 'rejection reasons must be recorded')
  assert.equal(article?.wpPostId, undefined)

  h.repos.close()
})

test('irrelevant classifications are rejected with a recorded reason', async () => {
  const h = harness()
  const { run } = await runPipeline(h, { mock: { classifyAsIrrelevant: true } })

  assert.equal(run.counters.articlesGenerated, 0)
  assert.equal(h.wp.created.length, 0)

  const rejected = h.repos.stories.listByStatus('rejected')
  assert.ok(rejected.length >= 1)
  assert.ok(
    rejected.every((story) => (story.rejectionReason ?? '').length > 0),
    'every rejection must record why',
  )

  h.repos.close()
})

test('deterministic prefilters reject noise without an LLM call', async () => {
  const h = harness()
  const { run } = await runPipeline(h)

  const rejected = h.repos.stories.listByStatus('rejected')
  const prefiltered = rejected.filter((story) =>
    (story.rejectionReason ?? '').startsWith('excluded-topic:'),
  )

  // The Tier 2 fixture carries a rumour item and a listicle; both are hard rejects.
  assert.ok(prefiltered.length >= 1, 'expected at least one hard-rejected story')
  assert.ok(run.llmUsage.calls > 0, 'the surviving candidates should still have been classified')

  h.repos.close()
})

test('the run summary records what happened', async () => {
  const h = harness()
  const { run } = await runPipeline(h)

  const stored = h.repos.runs.get(run.id)
  assert.ok(stored, 'the run must be persisted')
  assert.equal(stored?.status, 'completed')
  assert.ok(stored!.finishedAt, 'finishedAt must be set')
  assert.equal(stored?.counters.sourcesChecked, 2)
  assert.ok(stored!.llmUsage.calls > 0, 'LLM usage must be recorded')

  h.repos.close()
})

/* ── deferral is not rejection (§27) ──────────────────────────────────────── */

test('a story deferred by a cap is reconsidered on the next run', async () => {
  /*
   * Regression guard. The scoring loop used to iterate only the stories built
   * from the CURRENT run's non-duplicate items. A deferred story's items were
   * already persisted and marked seen, so it could never re-cluster and no later
   * run would ever look at it again — stories deferred at a cap were stranded
   * permanently, which is the opposite of what §27 promises.
   */
  const h = harness()

  // Run 1: a candidate cap of 1 forces everything past the first story to defer.
  const first = await runPipeline(h, {
    env: testEnv({
      limits: {
        maxItemsPerSourcePerRun: 25,
        maxCandidatesPerRun: 1,
        maxStoriesVerifiedPerRun: 5,
        maxArticlesPerRun: 2,
        maxDraftsPerRun: 2,
        maxLlmCallsPerRun: 60,
        maxTokensPerRun: 250_000,
      },
    }),
  })

  assert.equal(first.run.status, 'completed')
  assert.ok(first.run.counters.storiesDeferred > 0, 'the cap should have deferred stories')

  const deferred = h.repos.stories.listByStatus('deferred')
  assert.ok(deferred.length > 0, 'deferred stories should be persisted as deferred')

  // Run 2: every feed item is now a duplicate, so clustering yields nothing new.
  // The deferred backlog is the only thing left to work on, and it must be
  // picked up rather than stranded.
  const second = await runPipeline(h)

  assert.equal(second.run.status, 'completed')
  assert.ok(
    second.run.counters.storiesCandidate > 0,
    'the deferred backlog must be offered as candidates even when nothing new arrived',
  )

  const stillDeferred = h.repos.stories.listByStatus('deferred')
  assert.ok(
    stillDeferred.length < deferred.length,
    'the second run must actually work through the backlog, not re-defer all of it',
  )
})

test('a deferred story that has aged out is rejected, not resurrected', async () => {
  // Re-offering the backlog must not bypass the freshness gate: the prefilter
  // re-checks staleness against the current clock on every pass.
  const h = harness()

  await runPipeline(h, {
    env: testEnv({
      limits: {
        maxItemsPerSourcePerRun: 25,
        maxCandidatesPerRun: 1,
        maxStoriesVerifiedPerRun: 5,
        maxArticlesPerRun: 2,
        maxDraftsPerRun: 2,
        maxLlmCallsPerRun: 60,
        maxTokensPerRun: 250_000,
      },
    }),
  })
  assert.ok(h.repos.stories.listByStatus('deferred').length > 0)

  // Come back far enough in the future that every fixture story is stale.
  const later = await runPipeline(h, { clock: clockHoursAfterFixtures(24 * 90) })

  assert.equal(later.run.status, 'completed')
  assert.equal(later.run.counters.draftsCreated, 0, 'a stale backlog must not produce a draft')
  assert.equal(
    h.repos.stories.listByStatus('deferred').length,
    0,
    'aged-out deferrals must be resolved, not left pending forever',
  )
})

/* ── zero caps do zero work (§27) ─────────────────────────────────────────── */

test('caps set to zero produce no LLM calls and no drafts', async () => {
  /*
   * The end-to-end half of the config regression in tests/config.test.ts.
   * Parsing 0 correctly is only half the guarantee — the run must actually
   * honour it. This is the run that the zero-cap incident was supposed to be.
   */
  const h = harness()
  const { run, exitCode } = await runPipeline(h, {
    env: testEnv({
      limits: {
        maxItemsPerSourcePerRun: 25,
        maxCandidatesPerRun: 0,
        maxStoriesVerifiedPerRun: 0,
        maxArticlesPerRun: 0,
        maxDraftsPerRun: 0,
        maxLlmCallsPerRun: 0,
        maxTokensPerRun: 0,
      },
    }),
  })

  assert.equal(exitCode, 0, 'a zeroed run is a clean run, not a failure')
  assert.equal(run.status, 'completed')
  assert.equal(run.llmUsage.calls, 0, 'no LLM call may be made')
  assert.equal(run.llmUsage.inputTokens + run.llmUsage.outputTokens, 0)
  assert.equal(run.counters.articlesGenerated, 0)
  assert.equal(run.counters.draftsCreated, 0)
  assert.equal(h.wp.created.length, 0, 'nothing may reach WordPress')

  /*
   * Deferring, not rejecting: the work is still there for a later run (§27).
   * itemsRejected is deliberately NOT asserted to be zero — it counts prefilter
   * rejections (stale, out of scope), which run before any cap is consulted and
   * are unrelated to budget.
   */
  assert.ok(run.counters.storiesDeferred > 0, 'capped-out stories must defer')
  assert.equal(
    h.repos.stories.listByStatus('deferred').length,
    run.counters.storiesDeferred,
    'every deferred story must be persisted as deferred, not rejected',
  )
})

test('zeroing every cap still publishes work an earlier run approved', async () => {
  /*
   * Deliberate asymmetry, documented on capInt in config/env.ts: the caps bound
   * LLM SPEND, and posting an already-approved article costs no tokens. A run
   * with every cap at zero is the cheapest way to drain the pending queue —
   * which is exactly what the failed idempotency check was reaching for.
   *
   * The pending state is seeded directly rather than by clearing wp_post_id on a
   * published article, because articles.upsert deliberately omits wp_post_id
   * from its UPDATE clause: regenerating an article must never detach its post,
   * or the next run would create a duplicate.
   */
  const h = harness()

  h.repos.stories.upsert({
    id: 'sty_zero_cap_pending',
    fingerprint: 'fp_zero_cap_pending',
    normalizedTitle: 'vendor ships aurora 2',
    title: 'Vendor ships Aurora 2',
    category: 'ai-models',
    newsItemIds: [],
    scores: { relevance: 8, importance: 8, freshness: 9, sourceTrust: 10, weighted: 8.5 },
    evidenceState: 'sufficient',
    status: 'generated',
    firstSeenAt: '2026-08-20T09:00:00.000Z',
    lastUpdatedAt: '2026-08-20T09:00:00.000Z',
  })

  h.repos.articles.upsert(
    {
      id: 'art_zero_cap_pending',
      storyId: 'sty_zero_cap_pending',
      title: 'Vendor ships Aurora 2',
      slug: 'vendor-ships-aurora-2',
      excerpt:
        'Vendor released Aurora 2 with a larger context window and new developer tooling, ' +
        'according to the vendor newsroom and independent coverage.',
      sections: [{ heading: 'What happened', paragraphs: ['Vendor released Aurora 2.'] }],
      content: '<h2>What happened</h2>\n<p>Vendor released Aurora 2.</p>\n<h2>Sources</h2>',
      category: 'ai-models',
      tags: ['AI Tools', 'Vendor'],
      sourceUrls: ['https://vendor.example.com/news/aurora-2'],
      claimIds: ['clm_abc123'],
      wordCount: 620,
      generatedAt: '2026-08-20T09:05:00.000Z',
      model: 'mock:mock-strong-v1',
      format: 'standard',
      schemaVersion: 1,
      confidence: 0.82,
      editorialStatus: 'approved',
      editorialIssues: [],
      revisionCount: 0,
    },
    'run_seed',
  )

  const { run } = await runPipeline(h, {
    env: testEnv({
      limits: {
        maxItemsPerSourcePerRun: 0,
        maxCandidatesPerRun: 0,
        maxStoriesVerifiedPerRun: 0,
        maxArticlesPerRun: 0,
        // Left at 1: this test is about the LLM caps not blocking publication.
        // The draft cap is a separate lever, exercised in the next test.
        maxDraftsPerRun: 1,
        maxLlmCallsPerRun: 0,
        maxTokensPerRun: 0,
      },
    }),
  })

  assert.equal(run.llmUsage.calls, 0, 'draining the queue must cost no LLM budget')
  assert.ok(run.counters.pendingRetried >= 1, 'the pending article must be retried')
  assert.equal(h.wp.created.length, 1, 'the pending article is posted exactly once')
  assert.equal(h.wp.created[0]?.slug, 'vendor-ships-aurora-2')
  assert.equal(h.wp.created[0]?.status, 'draft')
})

test('AGENT_MAX_DRAFTS_PER_RUN=0 stops every WordPress write', async () => {
  /*
   * The draft cap bounds CMS WRITES, which is a different axis from the LLM
   * caps. Zero here means "run, but create no posts" — useful for a scheduled
   * rehearsal against production data, and distinct from --dry-run in that
   * everything up to the CMS boundary still really happens.
   */
  const h = harness()

  h.repos.stories.upsert({
    id: 'sty_no_drafts',
    fingerprint: 'fp_no_drafts',
    normalizedTitle: 'vendor ships aurora 2',
    title: 'Vendor ships Aurora 2',
    category: 'ai-models',
    newsItemIds: [],
    scores: { relevance: 8, importance: 8, freshness: 9, sourceTrust: 10, weighted: 8.5 },
    evidenceState: 'sufficient',
    status: 'generated',
    firstSeenAt: '2026-08-20T09:00:00.000Z',
    lastUpdatedAt: '2026-08-20T09:00:00.000Z',
  })
  h.repos.articles.upsert(
    {
      id: 'art_no_drafts',
      storyId: 'sty_no_drafts',
      title: 'Vendor ships Aurora 2',
      slug: 'vendor-ships-aurora-2-nodraft',
      excerpt: 'x'.repeat(120),
      sections: [{ heading: 'What happened', paragraphs: ['Vendor released Aurora 2.'] }],
      content: '<h2>What happened</h2>\n<p>Vendor released Aurora 2.</p>\n<h2>Sources</h2>',
      category: 'ai-models',
      tags: ['Vendor'],
      sourceUrls: ['https://vendor.example.com/news/aurora-2'],
      claimIds: ['clm_abc123'],
      wordCount: 620,
      generatedAt: '2026-08-20T09:05:00.000Z',
      model: 'mock:mock-strong-v1',
      format: 'standard',
      schemaVersion: 1,
      confidence: 0.82,
      editorialStatus: 'approved',
      editorialIssues: [],
      revisionCount: 0,
    },
    'run_seed',
  )

  const { run } = await runPipeline(h, {
    env: testEnv({
      limits: {
        maxItemsPerSourcePerRun: 25,
        maxCandidatesPerRun: 20,
        maxStoriesVerifiedPerRun: 5,
        maxArticlesPerRun: 2,
        maxDraftsPerRun: 0,
        maxLlmCallsPerRun: 60,
        maxTokensPerRun: 250_000,
      },
    }),
  })

  assert.equal(run.status, 'completed', 'a zero-draft run is still a clean run')
  assert.equal(h.wp.created.length, 0, 'no WordPress post may be created')
  assert.equal(run.counters.draftsCreated, 0)

  // The work is preserved, not discarded: still approved, still unpublished.
  const pending = h.repos.articles.listAwaitingPublication()
  assert.ok(
    pending.some((article) => article.id === 'art_no_drafts'),
    'the pending article must stay queued for a later run',
  )
})
