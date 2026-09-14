import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/storage/db.ts'
import { createRepositories } from '../src/storage/repositories.ts'
import { parseFeed } from '../src/ingestion/feedParser.ts'
import { toNewsItem } from '../src/ingestion/ingest.ts'
import { clusterItems } from '../src/dedupe/cluster.ts'
import { emptyCounters, emptyUsage, type NewsItem } from '../src/domain/types.ts'
import { fixture, TEST_SOURCES, testLogger, testRepos } from './helpers.ts'

const VENDOR = TEST_SOURCES[0]!
const TECHPRESS = TEST_SOURCES[1]!

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'itm_test',
    sourceId: VENDOR.id,
    title: 'Vendor launches Aurora 2',
    url: 'https://vendor.example.com/news/aurora-2',
    canonicalUrl: 'https://vendor.example.com/news/aurora-2',
    discoveredAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    status: 'new',
    ...overrides,
  }
}

/* ── Feed parsing ─────────────────────────────────────────────────────────── */

test('RSS fixtures parse into normalized items', () => {
  const parsed = parseFeed(fixture('feed-tier1.xml'), 'vendor-news')
  assert.equal(parsed.title, 'Vendor AI — News')
  assert.equal(parsed.items.length, 2, 'two usable items')
  // One entry has an empty title, one has no link: both are skipped, not fatal.
  assert.equal(parsed.skipped, 2)

  const first = parsed.items[0]!
  assert.equal(first.title, 'Vendor launches Aurora 2 with a 500,000 token context window')
  assert.ok(first.link.startsWith('https://vendor.example.com/news/aurora-2'))
  assert.ok(first.summary?.includes('500,000 token context window'))
  assert.ok(!first.summary?.includes('<p>'), 'summary must be plain text')
})

test('Atom fixtures parse, resolving rel=alternate links', () => {
  const parsed = parseFeed(fixture('feed-tier2.xml'), 'techpress-ai')
  assert.equal(parsed.items.length, 3)
  assert.equal(parsed.items[0]?.link, 'https://techpress.example.com/2026/08/20/aurora-2-launch')
})

test('an HTML error page is a parse failure, not silent emptiness', () => {
  assert.throws(() => parseFeed(fixture('feed-malformed.xml'), 'vendor-news'), /rss|feed|rdf/i)
})

test('feed items normalize with a canonical URL stripped of tracking params', () => {
  const parsed = parseFeed(fixture('feed-tier1.xml'), 'vendor-news')
  const normalized = toNewsItem(parsed.items[0]!, VENDOR, new Date().toISOString())

  assert.ok(normalized)
  assert.equal(normalized!.canonicalUrl, 'https://vendor.example.com/news/aurora-2')
  assert.ok(normalized!.url.includes('utm_source'), 'the original URL is preserved as published')
  assert.equal(normalized!.sourceId, 'vendor-news')
})

/* ── Migrations and persistence ───────────────────────────────────────────── */

test('the database initializes on first open and survives reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-db-'))
  const path = join(dir, 'nested', 'news.sqlite')

  try {
    const first = createRepositories(openDatabase({ path }))
    first.newsItems.insertIfNew(item(), 'run_1')
    first.close()

    // Reopening must not wipe anything — the pipeline's memory is what prevents
    // duplicate drafts.
    const second = createRepositories(openDatabase({ path }))
    const known = second.newsItems.findKnownCanonicalUrls([item().canonicalUrl])
    assert.equal(known.size, 1, 'data must survive a reopen')
    second.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('canonical URL uniqueness is enforced by the database', () => {
  const repos = testRepos()

  assert.equal(repos.newsItems.insertIfNew(item(), 'run_1'), true)
  // Same canonical URL under a different id: the unique index must reject it.
  assert.equal(
    repos.newsItems.insertIfNew(item({ id: 'itm_other' }), 'run_1'),
    false,
    'a duplicate canonical URL must not be inserted',
  )

  repos.close()
})

test('rejection reasons are persisted, never silent', () => {
  const repos = testRepos()
  repos.newsItems.insertIfNew(item(), 'run_1')
  repos.newsItems.setStatus('itm_test', 'rejected', 'excluded-topic:clickbait')

  const stored = repos.newsItems.get('itm_test')
  assert.equal(stored?.status, 'rejected')
  assert.equal(stored?.rejectionReason, 'excluded-topic:clickbait')

  repos.close()
})

/* ── Clustering across runs ───────────────────────────────────────────────── */

test('items covering one event cluster into a single story', () => {
  const repos = testRepos()
  const now = new Date().toISOString()

  const result = clusterItems(
    [
      item({ id: 'itm_a', canonicalUrl: 'https://vendor.example.com/a', url: 'https://vendor.example.com/a' }),
      item({
        id: 'itm_b',
        sourceId: TECHPRESS.id,
        title: 'Aurora 2 officially launches with 500,000 token context',
        url: 'https://techpress.example.com/b',
        canonicalUrl: 'https://techpress.example.com/b',
        publishedAt: now,
      }),
    ],
    { repos, logger: testLogger(), runId: 'run_1' },
  )

  assert.equal(result.itemsPersisted, 2)
  assert.equal(result.stories.length, 1, 'both items must land on one story')
  assert.equal(result.stories[0]?.newsItemIds.length, 2)

  repos.close()
})

test('a rerun with identical items persists nothing new', () => {
  const repos = testRepos()
  const items = [item({ id: 'itm_a', canonicalUrl: 'https://vendor.example.com/a', url: 'https://vendor.example.com/a' })]

  const first = clusterItems(items, { repos, logger: testLogger(), runId: 'run_1' })
  assert.equal(first.itemsPersisted, 1)
  assert.equal(first.itemsDuplicate, 0)

  const second = clusterItems(items, { repos, logger: testLogger(), runId: 'run_2' })
  assert.equal(second.itemsPersisted, 0, 'nothing new must be persisted')
  assert.equal(second.itemsDuplicate, 1)
  assert.equal(second.stories.length, 0, 'no story is touched')

  repos.close()
})

test('unrelated items become separate stories', () => {
  const repos = testRepos()

  const result = clusterItems(
    [
      item({ id: 'itm_a', canonicalUrl: 'https://vendor.example.com/a', url: 'https://vendor.example.com/a' }),
      item({
        id: 'itm_b',
        title: 'Vendor publishes updated safety documentation',
        url: 'https://vendor.example.com/b',
        canonicalUrl: 'https://vendor.example.com/b',
      }),
    ],
    { repos, logger: testLogger(), runId: 'run_1' },
  )

  assert.equal(result.stories.length, 2, 'distinct events must not be merged')

  repos.close()
})

/* ── Article idempotency ──────────────────────────────────────────────────── */

test('an existing WordPress post id is never overwritten', () => {
  const repos = testRepos()

  repos.articles.upsert(
    {
      id: 'art_1', storyId: 'sty_1', title: 'A title', slug: 'a-title', excerpt: 'x'.repeat(90),
      sections: [], content: '<p>x</p>', category: 'ai-models', tags: ['OpenAI'],
      sourceUrls: ['https://a.test'], claimIds: ['clm_1'], wordCount: 600,
      generatedAt: new Date().toISOString(), model: 'mock:test', format: 'standard' as const, schemaVersion: 1,
      confidence: 0.9, editorialStatus: 'approved', revisionCount: 0,
    },
    'run_1',
  )

  repos.articles.recordWordPressPost('art_1', 4242)
  assert.equal(repos.articles.findByStory('sty_1')?.wpPostId, 4242)

  assert.throws(() => repos.articles.recordWordPressPost('art_1', 9999), /Refused to overwrite/)

  repos.close()
})

test('regenerating an article does not detach its WordPress post', () => {
  const repos = testRepos()
  const base = {
    id: 'art_1', storyId: 'sty_1', title: 'A title', slug: 'a-title', excerpt: 'x'.repeat(90),
    sections: [], content: '<p>x</p>', category: 'ai-models' as const, tags: ['OpenAI'],
    sourceUrls: ['https://a.test'], claimIds: ['clm_1'], wordCount: 600,
    generatedAt: new Date().toISOString(), model: 'mock:test', format: 'standard' as const, schemaVersion: 1,
    confidence: 0.9, editorialStatus: 'approved' as const, revisionCount: 0,
  }

  repos.articles.upsert(base, 'run_1')
  repos.articles.recordWordPressPost('art_1', 4242)

  // A later run regenerates the same story. wp_post_id must survive, or the next
  // publish attempt would create a duplicate.
  repos.articles.upsert({ ...base, title: 'A revised title', revisionCount: 1 }, 'run_2')

  const stored = repos.articles.findByStory('sty_1')
  assert.equal(stored?.title, 'A revised title')
  assert.equal(stored?.wpPostId, 4242, 'the WordPress link must survive regeneration')

  repos.close()
})

test('slug collisions are detected across articles', () => {
  const repos = testRepos()
  repos.articles.upsert(
    {
      id: 'art_1', storyId: 'sty_1', title: 'T', slug: 'taken-slug', excerpt: 'x'.repeat(90),
      sections: [], content: '', category: 'ai-models', tags: [], sourceUrls: [], claimIds: [],
      wordCount: 0, generatedAt: new Date().toISOString(), model: 'm', format: 'standard' as const, schemaVersion: 1,
      confidence: 0, editorialStatus: 'pending', revisionCount: 0,
    },
    'run_1',
  )

  assert.equal(repos.articles.slugTaken('taken-slug', 'art_2'), true)
  assert.equal(repos.articles.slugTaken('taken-slug', 'art_1'), false, 'its own row does not collide')
  assert.equal(repos.articles.slugTaken('free-slug', 'art_2'), false)

  repos.close()
})

/* ── Run lock ─────────────────────────────────────────────────────────────── */

test('the run lock is exclusive and recovers from a stale holder', () => {
  const repos = testRepos()
  const makeRun = (id: string, startedAt: string) => ({
    id, startedAt, status: 'running' as const, dryRun: false,
    counters: emptyCounters(), llmUsage: emptyUsage(), errors: [],
  })

  assert.equal(repos.runs.claimLock(makeRun('run_1', new Date().toISOString()), 30).acquired, true)

  const blocked = repos.runs.claimLock(makeRun('run_2', new Date().toISOString()), 30)
  assert.equal(blocked.acquired, false)
  assert.equal(blocked.acquired === false && blocked.heldBy.id, 'run_1')

  // A holder older than the threshold crashed; the next run reclaims the lock
  // and records the crashed run as failed rather than leaving it "running".
  repos.close()

  const fresh = testRepos()
  const longAgo = new Date(Date.now() - 90 * 60_000).toISOString()
  fresh.runs.claimLock(makeRun('run_old', longAgo), 30)

  const reclaimed = fresh.runs.claimLock(makeRun('run_new', new Date().toISOString()), 30)
  assert.equal(reclaimed.acquired, true, 'a stale lock must be reclaimable')
  assert.equal(fresh.runs.get('run_old')?.status, 'failed')
  assert.match(fresh.runs.get('run_old')?.note ?? '', /stale threshold/)

  fresh.close()
})

test('a feed with more entities than the parser default still parses', () => {
  /*
   * Regression guard. fast-xml-parser caps entity expansion at 1000 as a
   * billion-laughs defence, and the AWS Machine Learning feed carries ~1094 in
   * 570KB — the whole source failed with "not well-formed XML". Entity decoding
   * now happens in our own bounded decoder instead of the XML layer.
   */
  const entities = Array.from({ length: 1500 }, (_, i) => `Item &amp; ${i}`).join(' ')
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Big</title>
    <item><title>A perfectly ordinary headline about a launch</title>
      <link>https://vendor.example.com/a?x=1&amp;y=2</link>
      <description>${entities}</description></item>
  </channel></rss>`

  const parsed = parseFeed(xml, 'big-feed')
  assert.equal(parsed.items.length, 1)
  // Entities in the link are decoded by us, so the query string is correct.
  assert.equal(parsed.items[0]?.link, 'https://vendor.example.com/a?x=1&y=2')
  assert.ok(parsed.items[0]?.summary?.includes('Item & 0'), 'text entities are decoded')
})
