/*
 * Clustering: news items -> canonical stories (NEWS_AGENT.md §7 steps 4-5).
 *
 * Runs the three dedupe levels against persisted state, so the guarantee holds
 * across runs and not just within one:
 *
 *   L1/L2  canonical URL already in news_items  -> already seen, skip entirely
 *   L3     title similar to a recent story      -> attach to that story
 *   else                                        -> new story
 *
 * Attaching rather than splitting is deliberate: a false merge costs one missed
 * article, a false split costs a duplicate published post (§10).
 */

import { DEDUPE } from '../config/limits.ts'
import type { CandidateStory, NewsItem } from '../domain/types.ts'
import type { Repositories } from '../storage/repositories.ts'
import { storyId as makeStoryId } from '../utils/ids.ts'
import type { Logger } from '../utils/logger.ts'
import { hoursSince, nowIso } from '../utils/time.ts'
import { compareTitles, normalizeTitle } from './title.ts'
import { registrableDomain } from './url.ts'

export interface ClusterResult {
  /** Stories touched this run — new ones and existing ones that gained items. */
  stories: CandidateStory[]
  itemsPersisted: number
  itemsDuplicate: number
  storiesCreated: number
  storiesMerged: number
}

/**
 * Fingerprint identifying a real-world event.
 *
 * Derived from the normalized title so the same event re-discovered later maps
 * to the same story id. Deliberately not derived from the URL: the entire point
 * is that many URLs describe one event.
 */
export function storyFingerprint(title: string): string {
  const normalized = normalizeTitle(title)
  // Sorted tokens so word-order differences alone cannot fork a story.
  return normalized.split(' ').filter(Boolean).sort().join(' ')
}

export interface ClusterDeps {
  repos: Repositories
  logger: Logger
  runId: string
}

/**
 * Persists unseen items and groups them into stories.
 *
 * Items whose canonical URL is already in the database are counted as duplicates
 * and dropped without further work — that is the cheap path that keeps most of a
 * run free (§27).
 */
export function clusterItems(items: NewsItem[], deps: ClusterDeps): ClusterResult {
  const { repos, logger, runId } = deps
  const log = logger.child({ step: 'dedupe' })

  const known = repos.newsItems.findKnownCanonicalUrls(items.map((item) => item.canonicalUrl))
  const unseen = items.filter((item) => !known.has(item.canonicalUrl))
  const itemsDuplicate = items.length - unseen.length

  // Recent stories are the candidates for level-3 matching. The window bounds
  // both the comparison cost and the risk of merging unrelated anniversaries.
  const windowStart = new Date(Date.now() - DEDUPE.clusterWindowHours * 3_600_000).toISOString()
  const recentStories = repos.stories.listSince(windowStart)

  // Working set: existing stories plus ones created during this run, so two
  // items in the same batch describing one event land in the same story.
  const working = new Map<string, CandidateStory>()
  for (const story of recentStories) working.set(story.id, story)

  const touched = new Set<string>()
  let itemsPersisted = 0
  let storiesCreated = 0
  let storiesMerged = 0

  for (const item of unseen) {
    const match = findMatchingStory(item, working, repos)

    let story: CandidateStory
    if (match) {
      story = match.story
      storiesMerged += 1
      if (match.ambiguous && !story.ambiguousMerge) {
        story = { ...story, ambiguousMerge: true }
      }
      log.debug('Item merged into existing story', {
        storyId: story.id,
        score: Number(match.score.toFixed(3)),
        ambiguous: match.ambiguous,
        sharedEntities: match.sharedEntities.slice(0, 4),
      })
    } else {
      const fingerprint = storyFingerprint(item.title)
      const id = makeStoryId(fingerprint)
      const existing = working.get(id) ?? repos.stories.get(id)
      if (existing) {
        // Identical fingerprint: the same headline seen again, e.g. a feed that
        // re-published the item under a new URL.
        story = existing
        storiesMerged += 1
      } else {
        story = {
          id,
          fingerprint,
          normalizedTitle: normalizeTitle(item.title),
          title: item.title,
          newsItemIds: [],
          scores: { relevance: 0, importance: 0, freshness: 0, sourceTrust: 0, weighted: 0 },
          evidenceState: 'none',
          status: 'candidate',
          firstSeenAt: item.discoveredAt,
          lastUpdatedAt: item.discoveredAt,
        }
        storiesCreated += 1
      }
    }

    story = { ...story, lastUpdatedAt: nowIso() }

    /*
     * Order matters: the story row must exist before news_items.story_id points
     * at it, and the item must be persisted before it is linked. A crash between
     * these leaves an orphan row, which the next run tolerates; the reverse
     * would leave a dangling reference.
     */
    repos.stories.upsert(story)

    const inserted = repos.newsItems.insertIfNew({ ...item, storyId: story.id }, runId)
    if (!inserted) {
      // Another writer claimed this canonical URL between our read and write.
      log.debug('Item lost an insert race, treating as duplicate', { url: item.canonicalUrl })
      continue
    }
    itemsPersisted += 1

    repos.newsItems.attachStory(item.id, story.id)
    repos.stories.linkItem(story.id, item.id)

    story.newsItemIds = [...story.newsItemIds, item.id]
    working.set(story.id, story)
    touched.add(story.id)
  }

  const stories = [...touched]
    .map((id) => repos.stories.get(id))
    .filter((story): story is CandidateStory => story !== undefined)

  log.info('Clustering complete', {
    incoming: items.length,
    duplicates: itemsDuplicate,
    persisted: itemsPersisted,
    storiesCreated,
    storiesMerged,
  })

  return { stories, itemsPersisted, itemsDuplicate, storiesCreated, storiesMerged }
}

interface StoryMatch {
  story: CandidateStory
  score: number
  ambiguous: boolean
  sharedEntities: string[]
}

/**
 * Level 3: best title match within the clustering window.
 *
 * An item is never merged into a story built solely from the same publisher's
 * own items when the titles differ — a single outlet publishing two similar
 * headlines is usually two articles, whereas two outlets with similar headlines
 * is usually one event.
 */
function findMatchingStory(
  item: NewsItem,
  working: Map<string, CandidateStory>,
  repos: Repositories,
): StoryMatch | undefined {
  let best: StoryMatch | undefined

  for (const story of working.values()) {
    // Stories already published or rejected still absorb duplicates: that is how
    // a re-reported story avoids becoming a second article.
    if (hoursSince(story.firstSeenAt) > DEDUPE.clusterWindowHours) continue

    const verdict = compareTitles(item.title, story.title, DEDUPE)
    if (!verdict.sameStory) continue
    if (best && verdict.score <= best.score) continue

    best = {
      story,
      score: verdict.score,
      ambiguous: verdict.ambiguous,
      sharedEntities: verdict.sharedEntities,
    }
  }

  if (!best) return undefined

  /*
   * Same-publisher guard. If every item already in the story came from this
   * item's own domain and the match was only ambiguous-grade, prefer a separate
   * story: outlets publish follow-ups with near-identical headlines.
   */
  if (best.ambiguous) {
    const existingItems = repos.newsItems.listByIds(best.story.newsItemIds)
    const itemDomain = registrableDomain(item.url)
    const allSameDomain =
      existingItems.length > 0 &&
      existingItems.every((existing) => registrableDomain(existing.url) === itemDomain)
    if (allSameDomain) return undefined
  }

  return best
}
