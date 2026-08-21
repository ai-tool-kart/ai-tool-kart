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
import type { NewsSource } from '../src/domain/types.ts'
import { openDatabase } from '../src/storage/db.ts'
import { createRepositories, type Repositories } from '../src/storage/repositories.ts'
import { createLogger, type Logger } from '../src/utils/logger.ts'
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

/** Discards output unless TEST_LOGS=1, so failures stay readable. */
export function testLogger(): Logger {
  if (process.env.TEST_LOGS === '1') {
    return createLogger({ level: 'debug', format: 'pretty' })
  }
  return createLogger({ level: 'error', format: 'json', write: () => {} })
}

export function testEnv(overrides: Partial<AgentEnv> = {}): AgentEnv {
  return {
    llm: { provider: 'mock' },
    dbPath: ':memory:',
    autoPublish: false,
    limits: {
      maxItemsPerSourcePerRun: 25,
      maxCandidatesPerRun: 20,
      maxStoriesVerifiedPerRun: 5,
      maxArticlesPerRun: 2,
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

export interface MockWordPress extends WordPressClient {
  readonly created: CreatePostPayload[]
  readonly terms: WordPressTerm[]
  /** Forces the next createPost call to fail with this error. */
  failNextCreate(error: Error): void
}

export interface MockWordPressOptions {
  /** Throw on every createPost, e.g. to simulate an outage. */
  alwaysFail?: Error
  /** Post ids handed out in order. */
  startId?: number
}

export function mockWordPress(options: MockWordPressOptions = {}): MockWordPress {
  const created: CreatePostPayload[] = []
  const terms: WordPressTerm[] = []
  const posts = new Map<number, WordPressPost>()
  let nextId = options.startId ?? 1000
  let nextTermId = 10
  let pendingFailure: Error | undefined

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

    async findTerm(_taxonomy, slug) {
      return terms.find((term) => term.slug === slug)
    },

    async createTerm(_taxonomy, name, slug) {
      const term: WordPressTerm = { id: (nextTermId += 1), name, slug }
      terms.push(term)
      return term
    },

    async checkConnection() {
      return { ok: true }
    },
  }
}
