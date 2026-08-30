/*
 * Ingestion: fetch -> parse -> normalize -> NewsItem (NEWS_AGENT.md §7 steps 2-4).
 *
 * Source isolation is the rule here. A feed that is down, slow, rate-limited or
 * serving an HTML error page costs one log line and nothing else; the run
 * continues with every other source.
 */

import type { AgentEnv } from '../config/env.ts'
import { EDITORIAL_SCOPE } from '../config/editorial.ts'
import type { NewsItem, NewsSource } from '../domain/types.ts'
import { isAgentError } from '../domain/errors.ts'
import { canonicalizeUrl, isBannedDomain } from '../dedupe/url.ts'
import { fetchText } from '../utils/http.ts'
import { newsItemId } from '../utils/ids.ts'
import type { Logger } from '../utils/logger.ts'
import { errorFields } from '../utils/logger.ts'
import { parseFeedDate, systemClock, type Clock } from '../utils/time.ts'
import { truncateWords } from '../utils/text.ts'
import { parseFeed, type RawFeedItem } from './feedParser.ts'

export interface IngestResult {
  items: NewsItem[]
  sourcesChecked: number
  sourcesFailed: number
  /** Items dropped before persistence, with the reason, for the run log. */
  droppedBeforePersist: number
}

/** Feed summaries are untrusted text and only ever used as classifier context. */
const MAX_SUMMARY_CHARS = 1200

export function toNewsItem(
  raw: RawFeedItem,
  source: NewsSource,
  discoveredAt: string,
  reference: Date = new Date(),
): NewsItem | undefined {
  const canonicalUrl = canonicalizeUrl(raw.link)
  if (!canonicalUrl) return undefined

  const title = raw.title.trim()
  if (title.length < EDITORIAL_SCOPE.minTitleLength) return undefined

  const publishedAt = parseFeedDate(raw.publishedAt, reference)

  return {
    id: newsItemId(canonicalUrl),
    sourceId: source.id,
    title,
    url: raw.link,
    canonicalUrl,
    ...(publishedAt ? { publishedAt } : {}),
    discoveredAt,
    ...(raw.summary ? { rawSummary: truncateWords(raw.summary, MAX_SUMMARY_CHARS) } : {}),
    status: 'new' as const,
  }
}

export interface IngestDeps {
  env: AgentEnv
  logger: Logger
  /** Test seam: replaced with a fixture reader in tests. */
  fetchFeed?: (source: NewsSource) => Promise<string>
  /** Editorial "now": stamps discoveredAt and bounds future-dated feed items. */
  clock?: Clock
}

async function defaultFetchFeed(source: NewsSource, env: AgentEnv): Promise<string> {
  const response = await fetchText(source.url, {
    timeoutMs: env.http.timeoutMs,
    maxResponseBytes: env.http.maxResponseBytes,
    userAgent: env.http.userAgent,
    accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  })
  return response.body
}

/**
 * Fetches every source and returns normalized items.
 *
 * Sources are fetched sequentially rather than in parallel. The list is short,
 * the run is not latency-sensitive, and sequential requests are the polite way
 * to treat feeds we do not own (NEWS_AGENT.md §45 of the implementation brief).
 */
export async function ingestSources(
  sources: NewsSource[],
  deps: IngestDeps,
): Promise<IngestResult> {
  const { env, logger, clock = systemClock } = deps
  const fetchFeed = deps.fetchFeed ?? ((source: NewsSource) => defaultFetchFeed(source, env))
  const discoveredAt = clock.nowIso()
  const reference = clock.now()

  const items: NewsItem[] = []
  const seenCanonical = new Set<string>()
  let sourcesChecked = 0
  let sourcesFailed = 0
  let droppedBeforePersist = 0

  for (const source of sources) {
    const log = logger.child({ step: 'ingest', sourceId: source.id })
    sourcesChecked += 1

    let xml: string
    try {
      xml = await fetchFeed(source)
    } catch (error) {
      sourcesFailed += 1
      log.warn('Source fetch failed', errorFields(error))
      continue
    }

    let parsed
    try {
      parsed = parseFeed(xml, source.id)
    } catch (error) {
      sourcesFailed += 1
      log.warn('Source parse failed', {
        ...errorFields(error),
        // Never log the body — it is untrusted and can be enormous.
        bytes: xml.length,
      })
      continue
    }

    const cap = source.maxItemsPerRun ?? env.limits.maxItemsPerSourcePerRun
    let accepted = 0
    let skipped = parsed.skipped

    for (const raw of parsed.items) {
      if (accepted >= cap) break

      const item = toNewsItem(raw, source, discoveredAt, reference)
      if (!item) {
        skipped += 1
        continue
      }

      /*
       * Banned domains are dropped at the door. A feed can link anywhere, and
       * ingesting a content mill just to reject it later wastes a database row
       * and muddies the dedupe table (§4).
       */
      if (isBannedDomain(item.url, EDITORIAL_SCOPE.bannedDomains)) {
        droppedBeforePersist += 1
        continue
      }

      // Within-run dedupe: one feed can list the same link twice, and two feeds
      // frequently carry the same syndicated URL.
      if (seenCanonical.has(item.canonicalUrl)) {
        droppedBeforePersist += 1
        continue
      }
      seenCanonical.add(item.canonicalUrl)

      items.push(item)
      accepted += 1
    }

    log.info('Source ingested', {
      found: parsed.items.length,
      accepted,
      skipped,
      cappedAt: accepted >= cap ? cap : undefined,
    })
  }

  return { items, sourcesChecked, sourcesFailed, droppedBeforePersist }
}

/** True when the failure should mark the source rather than the run. */
export function isSourceFailure(error: unknown): boolean {
  return isAgentError(error) && (error.code === 'SOURCE_FETCH' || error.code === 'SOURCE_PARSE')
}
