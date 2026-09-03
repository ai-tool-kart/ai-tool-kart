import test from 'node:test'
import assert from 'node:assert/strict'
import { executePipeline } from '../src/pipeline/run.ts'
import { wordPressAuthError } from '../src/domain/errors.ts'
import type { ArticleDraft, CandidateStory } from '../src/domain/types.ts'
import type { Repositories } from '../src/storage/repositories.ts'
import {
  mockWordPress,
  TEST_CLOCK,
  TEST_SOURCES,
  testEnv,
  testLogger,
  testRepos,
} from './helpers.ts'

/*
 * The retry/idempotency contract for NEWS_AGENT.md §24:
 *
 *   "WordPress unavailable → keep the approved draft persisted and retry on a
 *    later run. Do not regenerate."
 *
 * These tests deliberately give the pipeline NOTHING new to ingest. That is the
 * whole point: by the time a retry is needed, the story's news items are already
 * in the database and dedupe classifies every one of them as seen, so the story
 * can never re-enter generation. If the retry depended on fresh input it would
 * never fire in production, which is exactly the gap this suite pins down.
 */

/** A syntactically valid feed carrying no items. */
const EMPTY_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Quiet</title><link>https://vendor.example.com/</link>
<description>No news today</description></channel></rss>`

const NO_NEW_ITEMS = async () => EMPTY_FEED

const STORY_ID = 'sty_pending_retry'
const ARTICLE_ID = 'art_pending_retry'

function pendingStory(): CandidateStory {
  return {
    id: STORY_ID,
    fingerprint: 'fp_pending_retry',
    normalizedTitle: 'vendor ships aurora 2',
    title: 'Vendor ships Aurora 2',
    category: 'ai-models',
    newsItemIds: [],
    scores: { relevance: 8, importance: 8, freshness: 9, sourceTrust: 10, weighted: 8.5 },
    evidenceState: 'sufficient',
    status: 'generated',
    firstSeenAt: '2026-08-20T09:00:00.000Z',
    lastUpdatedAt: '2026-08-20T09:00:00.000Z',
  }
}

/** An article in the exact state the bug leaves behind: approved, never posted. */
function pendingArticle(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    id: ARTICLE_ID,
    storyId: STORY_ID,
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
    schemaVersion: 1,
    confidence: 0.82,
    editorialStatus: 'approved',
    editorialIssues: [],
    revisionCount: 0,
    ...overrides,
  }
}

/** Seeds the database with an approved article an earlier run failed to post. */
function seedPending(repos: Repositories, overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  repos.stories.upsert(pendingStory())
  const article = pendingArticle(overrides)
  repos.articles.upsert(article, 'run_earlier')
  return article
}

interface Harness {
  repos: Repositories
  wp: ReturnType<typeof mockWordPress>
}

async function runPipeline(h: Harness, overrides: Record<string, unknown> = {}) {
  return executePipeline({
    env: testEnv(),
    repos: h.repos,
    logger: testLogger(),
    dryRun: false,
    sources: TEST_SOURCES,
    ingest: { fetchFeed: NO_NEW_ITEMS },
    gather: { fetchPage: async () => { throw new Error('no page fixture: nothing should be gathered') } },
    wordPressClient: h.wp,
    clock: TEST_CLOCK,
    ...overrides,
  })
}

/* ── 1. the pending article is retried at all ─────────────────────────────── */

test('an approved article with no wp_post_id is retried even when nothing new was ingested', async () => {
  const h = { repos: testRepos(), wp: mockWordPress() }
  seedPending(h.repos)

  const { run, exitCode } = await runPipeline(h)

  assert.equal(exitCode, 0)
  assert.equal(run.status, 'completed')
  assert.equal(run.counters.itemsDiscovered, 0, 'the run must have had no new input')
  assert.equal(run.counters.pendingRetried, 1, 'the pending article must have been attempted')
  assert.equal(h.wp.created.length, 1, 'WordPress must have been called for the pending article')
  assert.equal(h.wp.created[0]?.slug, 'vendor-ships-aurora-2')

  h.repos.close()
})

/* ── 2. the retry regenerates nothing ─────────────────────────────────────── */

test('the retry path makes zero LLM calls and does not rewrite the article', async () => {
  const h = { repos: testRepos(), wp: mockWordPress() }
  const seeded = seedPending(h.repos)

  const { run } = await runPipeline(h)

  // The strongest available proof that neither the Writer nor the Editor ran:
  // the whole run's LLM budget went untouched.
  assert.equal(run.llmUsage.calls, 0, 'a retry must not call the LLM at all')
  assert.equal(run.counters.articlesGenerated, 0, 'nothing may be generated')
  assert.equal(run.counters.storiesVerified, 0, 'nothing may be re-verified')

  const after = h.repos.articles.findByStory(seeded.storyId)
  assert.ok(after)
  // The persisted article is the work item, byte for byte.
  assert.equal(after.id, seeded.id, 'no second article row may be created')
  assert.equal(after.content, seeded.content, 'the body must not be rewritten')
  assert.equal(after.generatedAt, seeded.generatedAt, 'the draft must not be regenerated')
  assert.equal(after.revisionCount, 0, 'the editor must not have triggered a revision')
  assert.equal(after.confidence, seeded.confidence)

  h.repos.close()
})

/* ── 3. a successful retry records the post ───────────────────────────────── */

test('a successful retry persists wp_post_id and a draft status', async () => {
  const h = { repos: testRepos(), wp: mockWordPress({ startId: 4000 }) }
  seedPending(h.repos)

  const { run } = await runPipeline(h)

  const article = h.repos.articles.findByStory(STORY_ID)
  assert.ok(article?.wpPostId, 'wp_post_id must be persisted')
  assert.equal(article.wpStatus, 'draft', 'the post must be recorded as a draft')
  assert.ok(article.publishedToWpAt, 'the publication timestamp must be recorded')
  assert.equal(article.editorialStatus, 'approved')
  assert.equal(run.counters.draftsCreated, 1)

  // The Phase G policy, asserted at the payload boundary.
  assert.equal(h.wp.created[0]?.status, 'draft')

  // The story is no longer in the publication queue.
  assert.equal(h.repos.articles.listAwaitingPublication().length, 0)
  assert.equal(h.repos.stories.get(STORY_ID)?.status, 'published')

  h.repos.close()
})

/* ── 4. a failed retry stays pending and is retried again ─────────────────── */

test('a retry that fails leaves the article approved, pending, and retryable', async () => {
  const down = { repos: testRepos(), wp: mockWordPress({ alwaysFail: new Error('ECONNREFUSED') }) }
  seedPending(down.repos)

  const first = await runPipeline(down)

  assert.equal(first.exitCode, 0, 'a CMS outage is not a run failure')
  assert.equal(first.run.counters.pendingRetried, 1, 'the attempt was made')
  assert.equal(down.wp.created.length, 0, 'nothing was created')

  const pending = down.repos.articles.listAwaitingPublication()
  assert.equal(pending.length, 1, 'the article must remain in the publication queue')
  assert.equal(pending[0]?.id, ARTICLE_ID)
  assert.equal(pending[0]?.editorialStatus, 'approved', 'it must remain approved')
  assert.equal(pending[0]?.wpPostId, undefined, 'wp_post_id must remain NULL')

  // A later run, against a WordPress that has come back, publishes it.
  const recovered = { repos: down.repos, wp: mockWordPress({ startId: 7000 }) }
  const second = await runPipeline(recovered)

  assert.equal(second.run.counters.pendingRetried, 1)
  assert.equal(recovered.wp.created.length, 1, 'the recovered run must publish it')
  assert.ok(recovered.repos.articles.findByStory(STORY_ID)?.wpPostId)

  down.repos.close()
})

test('a WordPress auth failure stops publishing, logs it, and keeps the draft pending', async () => {
  const h = {
    repos: testRepos(),
    wp: mockWordPress({ alwaysFail: wordPressAuthError('401 Unauthorized') }),
  }
  seedPending(h.repos)

  const { run, exitCode } = await runPipeline(h)

  // §25: 401/403 is an operator problem — no retry, publishing off for the run.
  assert.equal(exitCode, 0, 'an operator misconfiguration is not a run crash')
  assert.equal(h.wp.created.length, 0)
  assert.ok(
    run.errors.some((error) => error.code === 'WORDPRESS_AUTH'),
    'the auth failure must be recorded on the run, not swallowed',
  )

  const pending = h.repos.articles.listAwaitingPublication()
  assert.equal(pending.length, 1, 'the draft survives an auth failure')
  assert.equal(pending[0]?.wpPostId, undefined)

  h.repos.close()
})

/* ── 5. an already-published article is never re-posted ───────────────────── */

test('an article that already has a wp_post_id is never sent to WordPress again', async () => {
  const h = { repos: testRepos(), wp: mockWordPress() }
  seedPending(h.repos)
  // Publication already happened in an earlier run.
  h.repos.articles.recordWordPressPost(ARTICLE_ID, 5150)

  const { run } = await runPipeline(h)

  assert.equal(h.wp.created.length, 0, 'createPost must never be called')
  assert.equal(run.counters.pendingRetried, 0, 'a published article is not a work item')
  assert.equal(
    h.repos.articles.listAwaitingPublication().length,
    0,
    'a published article must not appear in the pending queue',
  )
  assert.equal(h.repos.articles.findByStory(STORY_ID)?.wpPostId, 5150, 'the post id is untouched')

  h.repos.close()
})

/* ── 6. repeated runs after a successful retry create nothing further ─────── */

test('runs after a successful retry issue no further POST /posts', async () => {
  const h = { repos: testRepos(), wp: mockWordPress({ startId: 8000 }) }
  seedPending(h.repos)

  await runPipeline(h)
  assert.equal(h.wp.created.length, 1, 'the first run publishes')
  const wpPostId = h.repos.articles.findByStory(STORY_ID)?.wpPostId
  assert.ok(wpPostId)

  await runPipeline(h)
  await runPipeline(h)

  assert.equal(h.wp.created.length, 1, 'later runs must not create a second draft')
  assert.equal(
    h.repos.articles.findByStory(STORY_ID)?.wpPostId,
    wpPostId,
    'the recorded post id must not change',
  )

  h.repos.close()
})

/* ── the retry never runs against the CMS in a dry run ────────────────────── */

test('a dry run reports pending drafts but never posts them', async () => {
  const h = { repos: testRepos(), wp: mockWordPress() }
  seedPending(h.repos)

  const { run } = await runPipeline(h, { dryRun: true })

  assert.equal(h.wp.created.length, 0, 'a dry run must not touch WordPress')
  assert.equal(run.counters.pendingRetried, 0)
  assert.equal(
    h.repos.articles.listAwaitingPublication().length,
    1,
    'the draft stays pending after a dry run',
  )

  h.repos.close()
})

/* ── a draft that is no longer approved is not published by the back door ── */

test('a draft whose editorial status regressed is not published by the retry', async () => {
  const h = { repos: testRepos(), wp: mockWordPress() }
  seedPending(h.repos, { editorialStatus: 'rejected' })

  const { run } = await runPipeline(h)

  assert.equal(h.wp.created.length, 0, 'only approved drafts may be published')
  assert.equal(run.counters.pendingRetried, 0)

  h.repos.close()
})
