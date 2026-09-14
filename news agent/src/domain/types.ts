/*
 * Domain models (NEWS_AGENT.md §8).
 *
 * These are the contracts between pipeline steps. The storage layer maps them to
 * SQLite rows; nothing else in the codebase knows the row shape.
 */

import type { ArticleFormat } from '../config/limits.ts'
import type { EditorialCategory } from '../config/editorial.ts'

export type TrustTier = 1 | 2 | 3

export type SourceType = 'rss' | 'api' | 'web'

export interface NewsSource {
  id: string
  name: string
  type: SourceType
  url: string
  /** Publisher shown in article source lists. */
  publisher: string
  trustTier: TrustTier
  enabled: boolean
  /** Classification hint only — never a decision. */
  categories?: EditorialCategory[]
  maxItemsPerRun?: number
  /** Why a source is disabled, so the reason survives in the registry. */
  note?: string
}

export type NewsItemStatus = 'new' | 'duplicate' | 'rejected' | 'clustered' | 'error'

export interface NewsItem {
  id: string
  sourceId: string
  title: string
  /** As published by the source. */
  url: string
  /** Normalized dedupe key. Unique across the whole table. */
  canonicalUrl: string
  publishedAt?: string
  discoveredAt: string
  /** Untrusted third-party text. Never interpolated into a system prompt. */
  rawSummary?: string
  status: NewsItemStatus
  rejectionReason?: string
  storyId?: string
}

export type EvidenceState =
  | 'none'
  | 'gathering'
  | 'sufficient'
  | 'insufficient'
  | 'conflicting'

export type StoryStatus =
  | 'candidate'
  | 'verified'
  | 'generated'
  | 'published'
  | 'rejected'
  | 'deferred'

export interface StoryScores {
  relevance: number
  importance: number
  freshness: number
  sourceTrust: number
  weighted: number
}

export interface CandidateStory {
  id: string
  fingerprint: string
  normalizedTitle: string
  title: string
  category?: EditorialCategory
  newsItemIds: string[]
  scores: StoryScores
  evidenceState: EvidenceState
  duplicateOfStoryId?: string
  status: StoryStatus
  rejectionReason?: string
  /** Set when title similarity was in the ambiguous band (§10). */
  ambiguousMerge?: boolean
  firstSeenAt: string
  lastUpdatedAt: string
}

export type ClaimType =
  | 'launch'
  | 'capability'
  | 'pricing'
  | 'date'
  | 'benchmark'
  | 'quote'
  | 'funding'
  | 'other'

export type SupportLevel = 'verified' | 'single-source' | 'unsupported' | 'conflicting'

export interface Claim {
  id: string
  text: string
  evidenceUrls: string[]
  supportLevel: SupportLevel
  claimType: ClaimType
  /** Highest-trust tier that supports this claim. */
  bestTier?: TrustTier
  /** Populated for conflicting claims: the competing statements. */
  conflictNote?: string
}

export type EvidenceSourceType =
  | 'official-blog'
  | 'release-notes'
  | 'documentation'
  | 'repo'
  | 'news'
  | 'social'

export interface SourceEvidence {
  id: string
  storyId: string
  url: string
  publisher: string
  title: string
  publishedAt?: string
  trustTier: TrustTier
  sourceType: EvidenceSourceType
  /** Cleaned, script-free text. Never HTML. */
  cleanedText: string
  extractedFacts: Claim[]
  retrievedAt: string
  contentHash: string
  /** True when extraction saw instruction-like text in the source (§28). */
  injectionSuspected?: boolean
}

/**
 * Search guidance produced after verification and before writing.
 *
 * Structured, not prose, so every field can be checked against the verified
 * claims (seo/validate.ts). SEO shapes structure and wording; it never changes
 * what the article asserts.
 */
export interface SeoBrief {
  primaryKeyword: string
  secondaryKeywords: string[]
  searchIntent: 'informational' | 'commercial' | 'navigational' | 'mixed'
  seoTitle: string
  metaDescription: string
  /** Already normalised by slugify(); the model never sets the final URL. */
  suggestedSlug: string
  suggestedHeadings: string[]
  /** Verified against the route registry. Never a composed URL. */
  internalLinkTargets: string[]
  /** Suggestions dropped because no such route exists, kept for the audit trail. */
  droppedLinkTargets?: string[]
  /** provider:model that produced the brief. */
  model?: string
}

/** Structured article body produced by the Writer. Never HTML. */
export interface ArticleSection {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export type EditorialStatus = 'pending' | 'approved' | 'needs-revision' | 'rejected'

export interface ArticleDraft {
  id: string
  storyId: string
  title: string
  slug: string
  excerpt: string
  /** Structured body, as returned by the Writer and validated by schema. */
  sections: ArticleSection[]
  /** Allowlisted HTML rendered by generation/render.ts. Built by us, never by the model. */
  content: string
  category: EditorialCategory
  tags: string[]
  sourceUrls: string[]
  claimIds: string[]
  wordCount: number
  generatedAt: string
  /** provider:model that produced the draft. */
  model: string
  /**
   * Editorial format chosen from evidence depth before writing (§15).
   * Determines the word-count range this draft is judged against.
   */
  format: ArticleFormat
  /**
   * Search guidance this draft was written against. Persisted so a reviewer can
   * see what SEO asked for and what the article actually did.
   */
  seo?: SeoBrief
  /** Schema version that produced this draft (§16). */
  schemaVersion: number
  confidence: number
  editorialStatus: EditorialStatus
  editorialNotes?: string
  editorialIssues?: string[]
  revisionCount: number
  wpPostId?: number
  wpStatus?: 'draft'
  publishedToWpAt?: string
}

export interface RunCounters {
  sourcesChecked: number
  sourcesFailed: number
  itemsDiscovered: number
  itemsDuplicate: number
  itemsRejected: number
  storiesCandidate: number
  storiesVerified: number
  articlesGenerated: number
  articlesApproved: number
  draftsCreated: number
  /** Approved drafts from earlier runs that this run re-attempted publishing. */
  pendingRetried: number
  /** SEO briefs successfully grounded and produced this run. */
  seoBriefsCreated: number
  storiesDeferred: number
}

export interface LlmUsage {
  calls: number
  inputTokens: number
  outputTokens: number
}

export interface RunError {
  step: string
  storyId?: string
  sourceId?: string
  code: string
  message: string
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'skipped'

export interface PipelineRun {
  id: string
  startedAt: string
  finishedAt?: string
  status: RunStatus
  dryRun: boolean
  counters: RunCounters
  llmUsage: LlmUsage
  errors: RunError[]
  /** Reason a run was skipped (lock held) or failed. */
  note?: string
}

export function emptyCounters(): RunCounters {
  return {
    sourcesChecked: 0,
    sourcesFailed: 0,
    itemsDiscovered: 0,
    itemsDuplicate: 0,
    itemsRejected: 0,
    storiesCandidate: 0,
    storiesVerified: 0,
    articlesGenerated: 0,
    articlesApproved: 0,
    draftsCreated: 0,
    pendingRetried: 0,
    seoBriefsCreated: 0,
    storiesDeferred: 0,
  }
}

export function emptyUsage(): LlmUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0 }
}
