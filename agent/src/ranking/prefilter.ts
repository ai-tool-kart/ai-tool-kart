/*
 * Deterministic prefilters (NEWS_AGENT.md §11, §27).
 *
 * Everything here runs BEFORE the first LLM call and costs nothing. The funnel
 * is only cheap if these rules do most of the rejecting: if a large share of
 * ingested items still reach the classifier, the rules are too loose.
 *
 * All topic knowledge comes from config/editorial.ts. No keyword lists live in
 * this file.
 */

import { EDITORIAL_SCOPE, type TopicRule } from '../config/editorial.ts'
import type { CandidateStory, NewsItem } from '../domain/types.ts'
import { isBannedDomain, registrableDomain } from '../dedupe/url.ts'
import { hoursSince } from '../utils/time.ts'

export interface PrefilterVerdict {
  pass: boolean
  /** Populated when pass is false; persisted as the story rejection reason. */
  reason?: string
  /** Deterministic prior from topic rules, applied to the weighted score. */
  topicAdjustment: number
  matchedTopics: string[]
  /** Distinct publishers backing the story — a corroboration signal. */
  independentPublishers: number
  hasTier1: boolean
}

function matchRules(haystack: string, rules: TopicRule[]): { matched: TopicRule[]; total: number } {
  const matched: TopicRule[] = []
  let total = 0
  for (const rule of rules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      matched.push(rule)
      total += rule.weight
    }
  }
  return { matched, total }
}

export interface PrefilterInput {
  story: CandidateStory
  items: NewsItem[]
  /** Trust tier per source id, from the registry. */
  tierBySourceId: Map<string, 1 | 2 | 3>
}

/**
 * Applies hard gates and computes the deterministic topic prior.
 *
 * Hard rejects short-circuit; soft rules only move the score. That split is the
 * one §4 asks for: banned domains and excluded topics veto, everything else
 * nudges.
 */
export function prefilterStory({ story, items, tierBySourceId }: PrefilterInput): PrefilterVerdict {
  const scope = EDITORIAL_SCOPE

  const tiers = items
    .map((item) => tierBySourceId.get(item.sourceId))
    .filter((tier): tier is 1 | 2 | 3 => tier !== undefined)
  const hasTier1 = tiers.includes(1)
  const independentPublishers = new Set(items.map((item) => registrableDomain(item.url))).size

  const base: Omit<PrefilterVerdict, 'pass' | 'reason'> = {
    topicAdjustment: 0,
    matchedTopics: [],
    independentPublishers,
    hasTier1,
  }

  // A story already carried to a terminal state must never be reconsidered.
  if (story.status === 'published') {
    return { ...base, pass: false, reason: 'already-published' }
  }
  if (story.status === 'rejected') {
    return { ...base, pass: false, reason: story.rejectionReason ?? 'previously-rejected' }
  }
  if (story.duplicateOfStoryId) {
    return { ...base, pass: false, reason: 'duplicate-of-existing-story' }
  }
  if (items.length === 0) {
    return { ...base, pass: false, reason: 'no-source-items' }
  }

  if (items.every((item) => isBannedDomain(item.url, scope.bannedDomains))) {
    return { ...base, pass: false, reason: 'banned-domain' }
  }

  if (story.title.trim().length < scope.minTitleLength) {
    return { ...base, pass: false, reason: 'title-too-short' }
  }

  /*
   * Age is measured from the freshest item. A story re-covered today is current
   * even if the first outlet published it two days ago; using the oldest item
   * would drop stories the moment a laggard feed picked them up.
   */
  const ages = items.map((item) => hoursSince(item.publishedAt ?? item.discoveredAt))
  const freshestHours = Math.min(...ages)
  if (freshestHours > scope.maxStoryAgeHours) {
    return { ...base, pass: false, reason: `stale (${Math.round(freshestHours)}h old)` }
  }

  const haystack = [story.title, ...items.map((item) => `${item.title} ${item.rawSummary ?? ''}`)]
    .join(' \n ')
    .toLowerCase()

  const excluded = matchRules(haystack, scope.excludedTopics)
  const hardReject = excluded.matched.find((rule) => rule.hardReject)
  if (hardReject) {
    return {
      ...base,
      pass: false,
      reason: `excluded-topic:${hardReject.id}`,
      matchedTopics: excluded.matched.map((rule) => rule.id),
    }
  }

  const included = matchRules(haystack, scope.includedTopics)

  /*
   * Audience-entity match: a story naming a tool our readers actually use is
   * materially more likely to matter to them. This is the deterministic half of
   * the relevance signal §11 asks for.
   */
  const entityHits = scope.audienceEntities.filter((entity) => haystack.includes(entity))
  const entityBonus = Math.min(entityHits.length, 3) * 0.5

  return {
    pass: true,
    topicAdjustment: included.total + excluded.total + entityBonus,
    matchedTopics: [...included.matched, ...excluded.matched].map((rule) => rule.id),
    independentPublishers,
    hasTier1,
  }
}
