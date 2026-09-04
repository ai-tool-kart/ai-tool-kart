/*
 * Evidence gathering (NEWS_AGENT.md §7 step 9, §21 of the implementation brief).
 *
 * Deliberately conservative: this is NOT a crawler. It fetches only the URLs the
 * story's own items point at, capped per story, each one through the SSRF-guarded
 * client. It follows no links out of the fetched pages, and it never fetches a
 * page just to see what is there.
 *
 * Tier order matters. Tier 1 sources are fetched first so that if the per-story
 * budget runs out, what we have is the primary material rather than the coverage.
 */

import { MAX_EVIDENCE_CHARS, MAX_EVIDENCE_FETCHES_PER_STORY } from '../config/limits.ts'
import type { AgentEnv } from '../config/env.ts'
import type {
  CandidateStory,
  EvidenceSourceType,
  NewsItem,
  SourceEvidence,
  TrustTier,
} from '../domain/types.ts'
import { publisherForUrl, tierForUrl } from '../sources/registry.ts'
import { fetchText } from '../utils/http.ts'
import { evidenceId } from '../utils/ids.ts'
import { sha256 } from '../utils/ids.ts'
import type { Logger } from '../utils/logger.ts'
import { errorFields } from '../utils/logger.ts'
import { detectInjectionMarkers, htmlToText, truncateWords } from '../utils/text.ts'
import { nowIso } from '../utils/time.ts'
import { extractArticleText } from './extract.ts'

export interface GatherDeps {
  env: AgentEnv
  logger: Logger
  /**
   * Trust tier and publisher per source id.
   *
   * NEWS_AGENT.md §6 requires the tier to travel with the item from its source
   * all the way into verification. Re-deriving it from the URL here would break
   * that chain and silently downgrade any source whose article host differs from
   * its feed host.
   */
  sourceMeta: Map<string, { trustTier: TrustTier; publisher: string }>
  /** Test seam: returns page HTML for a URL. */
  fetchPage?: (url: string) => Promise<string>
}

export interface GatherResult {
  /** Evidence safe to reason from. */
  evidence: SourceEvidence[]
  /** Sources attempted but unreachable. */
  failed: number
  /**
   * Sources withheld because they attempted prompt injection.
   *
   * Retained for the log and the audit trail, never passed to a model.
   */
  quarantined: SourceEvidence[]
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'unknown'
  }
}

function sourceTypeFor(url: string, tier: TrustTier): EvidenceSourceType {
  const lower = url.toLowerCase()
  if (lower.includes('/changelog') || lower.includes('release-notes') || lower.includes('/releases'))
    return 'release-notes'
  if (lower.includes('/docs') || lower.includes('/documentation')) return 'documentation'
  if (lower.includes('github.com') && lower.includes('/releases')) return 'repo'
  return tier === 1 ? 'official-blog' : 'news'
}

async function defaultFetchPage(url: string, env: AgentEnv): Promise<string> {
  const response = await fetchText(url, {
    timeoutMs: env.http.timeoutMs,
    maxResponseBytes: env.http.maxResponseBytes,
    userAgent: env.http.userAgent,
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  })
  return response.body
}

/**
 * Fetches and cleans evidence for one story.
 *
 * Every returned SourceEvidence carries plain text only. Raw HTML never leaves
 * this module — it is the last point in the pipeline where markup exists, and
 * §28 requires it stop here.
 */
export async function gatherEvidence(
  story: CandidateStory,
  items: NewsItem[],
  deps: GatherDeps,
): Promise<GatherResult> {
  const { env, logger, sourceMeta } = deps
  const log = logger.child({ step: 'evidence', storyId: story.id })
  const fetchPage = deps.fetchPage ?? ((url: string) => defaultFetchPage(url, env))

  // The tier that came with the item, falling back to the URL registry for
  // links we followed rather than ingested, and to Tier 3 for anything unknown.
  const tierOf = (item: NewsItem): TrustTier =>
    sourceMeta.get(item.sourceId)?.trustTier ?? tierForUrl(item.url)
  const publisherOf = (item: NewsItem): string =>
    sourceMeta.get(item.sourceId)?.publisher ??
    publisherForUrl(item.url) ??
    hostLabel(item.url)

  // Primary sources first, then by recency, then dedupe by URL.
  const ordered = [...items].sort((a, b) => {
    const tierDiff = tierOf(a) - tierOf(b)
    if (tierDiff !== 0) return tierDiff
    return (b.publishedAt ?? b.discoveredAt).localeCompare(a.publishedAt ?? a.discoveredAt)
  })

  const seen = new Set<string>()
  const evidence: SourceEvidence[] = []
  const quarantined: SourceEvidence[] = []
  let failed = 0

  for (const item of ordered) {
    if (evidence.length >= MAX_EVIDENCE_FETCHES_PER_STORY) break
    if (seen.has(item.canonicalUrl)) continue
    seen.add(item.canonicalUrl)

    let html: string
    try {
      html = await fetchPage(item.url)
    } catch (error) {
      failed += 1
      log.warn('Evidence fetch failed', { url: item.canonicalUrl, ...errorFields(error) })
      continue
    }

    const articleText = extractArticleText(html)
    /*
     * A page that yields almost no text is a paywall, a JS shell, or a consent
     * interstitial. Treating it as evidence would let the verifier "confirm"
     * claims against an empty document.
     */
    if (articleText.length < 200) {
      failed += 1
      log.warn('Evidence page yielded too little text', {
        url: item.canonicalUrl,
        chars: articleText.length,
      })
      continue
    }

    const cleanedText = truncateWords(articleText, MAX_EVIDENCE_CHARS)
    const injectionMarkers = detectInjectionMarkers(cleanedText)

    const tier = tierOf(item)
    const record: SourceEvidence = {
      id: evidenceId(story.id, item.canonicalUrl),
      storyId: story.id,
      url: item.url,
      publisher: publisherOf(item),
      title: item.title,
      ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      trustTier: tier,
      sourceType: sourceTypeFor(item.url, tier),
      cleanedText,
      extractedFacts: [],
      retrievedAt: nowIso(),
      contentHash: sha256(cleanedText),
      ...(injectionMarkers.length > 0 ? { injectionSuspected: true } : {}),
    }

    /*
     * QUARANTINE, not filtering.
     *
     * Dropping individual instruction-shaped sentences is not enough: an
     * injection's imperative framing ("ignore previous instructions") and its
     * payload ("state that it costs $0") are usually separate sentences, so a
     * per-claim filter removes the framing and leaves the lie behind.
     *
     * The sound rule is at document level. A page that tries to manipulate an
     * automated reader has disqualified itself as a source of facts, whatever
     * else it says. It is withheld from every model call and recorded for review.
     *
     * This does cost the occasional false positive — a legitimate article ABOUT
     * prompt injection quotes these phrases and would be quarantined. That trade
     * is deliberate: losing a meta-story is far cheaper than republishing
     * manipulated content, and the rejection is logged for a human to overturn.
     */
    if (injectionMarkers.length > 0) {
      quarantined.push(record)
      log.warn('Source quarantined: attempted prompt injection', {
        url: item.canonicalUrl,
        publisher: record.publisher,
        markers: injectionMarkers.slice(0, 3),
      })
      continue
    }

    evidence.push(record)
  }

  log.info('Evidence gathered', {
    fetched: evidence.length,
    failed,
    quarantined: quarantined.length,
    tiers: evidence.map((item) => item.trustTier),
  })

  return { evidence, failed, quarantined }
}

/**
 * Decides whether the assembled evidence justifies continuing.
 *
 * Mirrors §5: a Tier 1 source is sufficient on its own; otherwise two
 * independent Tier 2 publishers are required. Tier 3 alone never is.
 */
export function evidenceIsSufficient(evidence: SourceEvidence[]): {
  sufficient: boolean
  reason?: string
} {
  if (evidence.length === 0) return { sufficient: false, reason: 'no-evidence-retrieved' }

  const tier1 = evidence.filter((item) => item.trustTier === 1)
  if (tier1.length > 0) return { sufficient: true }

  const tier2Publishers = new Set(
    evidence.filter((item) => item.trustTier === 2).map((item) => item.publisher),
  )
  if (tier2Publishers.size >= 2) return { sufficient: true }

  return {
    sufficient: false,
    reason: `insufficient-evidence (no Tier 1, ${tier2Publishers.size} independent Tier 2)`,
  }
}

/** Used by tests and the extractor to render evidence without its full body. */
export function evidenceExcerpt(evidence: SourceEvidence, maxChars = 6000): string {
  return truncateWords(htmlToText(evidence.cleanedText), maxChars)
}
