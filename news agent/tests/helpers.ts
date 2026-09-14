/*
 * Shared test scaffolding.
 *
 * Everything here keeps tests offline: an in-memory database, a silent logger, a
 * fixture-backed fetcher, and a WordPress mock. No test may touch a live feed,
 * a real LLM, or the CMS.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { AgentEnv } from '../src/config/env.ts'
import { CATEGORY_LABELS, EDITORIAL_CATEGORIES } from '../src/config/editorial.ts'
import type { NewsSource } from '../src/domain/types.ts'
import { openDatabase } from '../src/storage/db.ts'
import { createRepositories, type Repositories } from '../src/storage/repositories.ts'
import { createLogger, type Logger } from '../src/utils/logger.ts'
import { fixedClock, type Clock } from '../src/utils/time.ts'
import type {
  CreatePostPayload,
  WordPressClient,
  WordPressPost,
  WordPressTerm,
} from '../src/wordpress/client.ts'

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

export function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8')
}

/*
 * The instant the fixture feeds are read as happening "now".
 *
 * The feed fixtures carry absolute publication dates spanning
 * 2026-08-19T12:00Z .. 2026-08-20T11:30Z. Pinning the run just after the newest
 * of them keeps every fixture story inside EDITORIAL_SCOPE.maxStoryAgeHours
 * without touching that threshold, so the production freshness gate runs at
 * full strength and the suite stays correct on any calendar date.
 *
 * If you add a feed fixture, give it a date at or before this instant.
 */
export const FIXTURE_NOW = '2026-08-20T12:00:00.000Z'

/** Clock pinned to FIXTURE_NOW; pass to executePipeline as `clock`. */
export const TEST_CLOCK: Clock = fixedClock(FIXTURE_NOW)

/** A clock offset from FIXTURE_NOW, for exercising the staleness boundary. */
export function clockHoursAfterFixtures(hours: number): Clock {
  return fixedClock(new Date(Date.parse(FIXTURE_NOW) + hours * 3_600_000))
}

/** Discards output unless TEST_LOGS=1, so failures stay readable. */
export function testLogger(): Logger {
  if (process.env.TEST_LOGS === '1') {
    return createLogger({ level: 'debug', format: 'pretty' })
  }
  return createLogger({ level: 'error', format: 'json', write: () => {} })
}

export function testEnv(overrides: Partial<AgentEnv> = {}): AgentEnv {
  return {
    enabled: true,
    llm: { provider: 'mock' },
    dbPath: ':memory:',
    autoPublish: false,
    limits: {
      maxItemsPerSourcePerRun: 25,
      maxCandidatesPerRun: 20,
      maxStoriesVerifiedPerRun: 5,
      maxArticlesPerRun: 2,
      maxDraftsPerRun: 2,
      maxLlmCallsPerRun: 60,
      maxTokensPerRun: 250_000,
    },
    minWeightedScore: 6,
    http: { timeoutMs: 5000, maxResponseBytes: 1_000_000, userAgent: 'test-agent/0.1' },
    runLockStaleMinutes: 30,
    log: { format: 'json', level: 'error' },
    ...overrides,
  }
}

export function testRepos(): Repositories {
  return createRepositories(openDatabase({ path: ':memory:' }))
}

/** Two fixture sources mirroring a Tier 1 vendor and a Tier 2 publication. */
export const TEST_SOURCES: NewsSource[] = [
  {
    id: 'vendor-news',
    name: 'Vendor News',
    type: 'rss',
    url: 'https://vendor.example.com/news/rss.xml',
    publisher: 'Vendor',
    trustTier: 1,
    enabled: true,
  },
  {
    id: 'techpress-ai',
    name: 'TechPress AI',
    type: 'rss',
    url: 'https://techpress.example.com/ai/feed',
    publisher: 'TechPress',
    trustTier: 2,
    enabled: true,
  },
]

/** Feed fetcher backed by fixtures; unknown sources fail like a dead feed. */
export function fixtureFeedFetcher(
  mapping: Record<string, string>,
): (source: NewsSource) => Promise<string> {
  return async (source) => {
    const file = mapping[source.id]
    if (!file) throw new Error(`no fixture configured for source ${source.id}`)
    return fixture(file)
  }
}

/** Page fetcher backed by fixtures, keyed by URL substring. */
export function fixturePageFetcher(
  mapping: Array<[match: string, file: string]>,
): (url: string) => Promise<string> {
  return async (url) => {
    for (const [match, file] of mapping) {
      if (url.includes(match)) return fixture(file)
    }
    throw new Error(`no page fixture for ${url}`)
  }
}

/** A mock term also records which taxonomy it belongs to, so a tag and a
 * category with the same slug stay distinct — exactly as in WordPress. */
export type MockTerm = WordPressTerm & { taxonomy?: 'categories' | 'tags' }

export interface MockWordPress extends WordPressClient {
  readonly created: CreatePostPayload[]
  readonly terms: MockTerm[]
  /** Forces the next createPost call to fail with this error. */
  failNextCreate(error: Error): void
}

export interface MockWordPressOptions {
  /** Throw on every createPost, e.g. to simulate an outage. */
  alwaysFail?: Error
  /** Post ids handed out in order. */
  startId?: number
  /**
   * Whether the configured editorial categories already exist.
   *
   * Defaults to true, which mirrors a real CMS after `npm run taxonomy:bootstrap`.
   * Categories are never created while publishing (§20), so a mock without them
   * models an UNBOOTSTRAPPED site — pass false to exercise that deferral.
   */
  seedCategories?: boolean
  /** Reject term creation with this error, e.g. a 403 from a low-privilege account. */
  failTermCreation?: Error
}

export function mockWordPress(options: MockWordPressOptions = {}): MockWordPress {
  const created: CreatePostPayload[] = []
  const terms: MockTerm[] = []
  const posts = new Map<number, WordPressPost>()
  let nextId = options.startId ?? 1000
  let nextTermId = 10
  let pendingFailure: Error | undefined

  // A bootstrapped CMS: the fixed editorial categories exist, tags do not.
  if (options.seedCategories !== false) {
    for (const category of EDITORIAL_CATEGORIES) {
      terms.push({ id: (nextTermId += 1), name: CATEGORY_LABELS[category], slug: category, taxonomy: 'categories' })
    }
  }

  return {
    baseUrl: 'https://cms.test/wp-json/wp/v2',
    created,
    terms,

    failNextCreate(error) {
      pendingFailure = error
    },

    async createPost(payload) {
      if (options.alwaysFail) throw options.alwaysFail
      if (pendingFailure) {
        const error = pendingFailure
        pendingFailure = undefined
        throw error
      }
      if (payload.status !== 'draft') {
        throw new Error(`mock WordPress received a non-draft status: ${payload.status}`)
      }
      created.push(payload)
      const post: WordPressPost = {
        id: (nextId += 1),
        slug: payload.slug,
        status: 'draft',
        link: `https://cms.test/?p=${nextId}`,
      }
      posts.set(post.id, post)
      return post
    },

    async getPost(id) {
      return posts.get(id)
    },

    async findTerm(taxonomy, slug) {
      return terms.find((term) => term.taxonomy === taxonomy && term.slug === slug)
    },

    async createTerm(taxonomy, name, slug) {
      if (options.failTermCreation) throw options.failTermCreation
      const term: WordPressTerm = { id: (nextTermId += 1), name, slug }
      terms.push({ ...term, taxonomy })
      return term
    },

    async checkConnection() {
      return { ok: true }
    },
  }
}
