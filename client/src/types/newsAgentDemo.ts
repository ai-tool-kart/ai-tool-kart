/*
 * Wire types for the News Agent demo dashboard.
 *
 * These mirror `news agent/src/pipeline/observer.ts` and
 * `news agent/src/demo/state.ts`. They are duplicated rather than imported
 * because the agent is a separate package that must never be pulled into the
 * browser bundle (NEWS_AGENT.md §3.2) — the boundary is the point, so the cost
 * of restating the shapes is accepted deliberately.
 *
 * Everything here is produced by a real pipeline run. There is no mock shape in
 * this file and no client-side derivation of pipeline state.
 */

export type StageStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'skipped'

export interface StageState {
  id: string
  label: string
  /** NEWS_AGENT.md §7 step numbers, e.g. "steps 2-4". */
  steps: string
  status: StageStatus
  startedAt?: string
  finishedAt?: string
  detail?: string
}

export interface StoryScores {
  relevance: number
  importance: number
  freshness: number
  sourceTrust: number
  weighted: number
}

export interface StoryCard {
  storyId: string
  title: string
  category?: string
  status: string
  publishedAt?: string
  firstSeenAt: string
  scores: StoryScores
  items: Array<{
    sourceId: string
    publisher: string
    title: string
    url: string
    publishedAt?: string
    trustTier?: number
  }>
  reason?: string
  recommendation?: string
  selected?: boolean
  rejectionReason?: string
}

export interface EvidenceSource {
  url: string
  publisher: string
  title: string
  publishedAt?: string
  trustTier: number
  sourceType: string
  retrievedAt: string
  excerpt: string
  excerptTruncated: boolean
  factsExtracted: number
  quarantined: boolean
}

export interface DemoClaim {
  id: string
  text: string
  claimType: string
  supportLevel: string
  bestTier?: number
  conflictNote?: string
  supportedBy: Array<{ url: string; publisher: string; trustTier?: number }>
  isCoreClaim?: boolean
}

export interface FormatDecision {
  format: string
  targetMinWords: number
  targetMaxWords: number
  reason: string
  signals: {
    substantiveClaims: number
    singleSourceClaims: number
    evidenceSources: number
    tier1Sources: number
    independentPublishers: number
    importance: number
  }
}

export interface SeoBrief {
  primaryKeyword: string
  secondaryKeywords: string[]
  searchIntent: string
  seoTitle: string
  metaDescription: string
  suggestedSlug: string
  suggestedHeadings: string[]
  internalLinkTargets: string[]
  droppedLinkTargets?: string[]
  model?: string
}

export interface DemoArticle {
  title: string
  slug: string
  excerpt: string
  category: string
  tags: string[]
  sections: Array<{ heading: string; paragraphs?: string[]; bullets?: string[] }>
  html: string
  wordCount: number
  format: string
  model: string
  generatedAt: string
  revisionCount: number
  sourceUrls: string[]
  claimIds: string[]
  seo?: SeoBrief
}

export interface QualityCheck {
  id: string
  label: string
  passed: boolean
  detail?: string
}

export interface EditorialReview {
  verdict: string
  confidence: number
  issues: string[]
  blockingIssues: string[]
  notes: string
  checks: QualityCheck[]
}

export interface WordPressResult {
  status: 'created' | 'skipped' | 'deferred' | 'dry-run' | 'failed'
  wpPostId?: number
  postStatus?: string
  slug?: string
  link?: string
  baseUrl?: string
  editorUrl?: string
  createdAt?: string
  reason?: string
}

export interface StoryState {
  storyId: string
  story: StoryCard
  stages: StageState[]
  evidence?: { sources: EvidenceSource[]; failed: number; sufficient: boolean; reason?: string }
  extraction?: {
    claims: DemoClaim[]
    failedSources: number
    injectionFlagged: boolean
    injectedClaimsDropped: number
  }
  verification?: {
    claims: DemoClaim[]
    coreClaimId?: string
    sufficient: boolean
    reason?: string
    counts: { verified: number; singleSource: number; unsupported: number; conflicting: number }
  }
  format?: FormatDecision
  article?: DemoArticle
  revisions: Array<{ at: string; issues: string[] }>
  editorial?: EditorialReview
  wordpress?: WordPressResult
  outcome?: { outcome: string; stage: string; reason?: string; at: string }
}

export interface RunSummary {
  sourcesChecked: number
  sourcesFailed: number
  itemsDiscovered: number
  storiesConsidered: number
  storiesSelected: number
  evidenceSources: number
  claimsExtracted: number
  claimsVerified: number
  claimsSingleSource: number
  claimsUnsupported: number
  claimsConflicting: number
  articleWords?: number
  qualityChecksPassed?: number
  qualityChecksTotal?: number
  editorialVerdict?: string
  editorialConfidence?: number
  wordpressStatus: string
  /** Drafts published this run from an earlier run's approved backlog (step 1b). */
  carriedOverDraftsCreated: number
  llmCalls: number
  llmTokens: number
}

export interface RunState {
  runId: string
  status: 'starting' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt: string
  finishedAt?: string
  dryRun: boolean
  provider: string
  limits: Record<string, number>
  wordpressBaseUrl?: string
  stages: StageState[]
  discovery: {
    sources: Array<{
      sourceId: string
      publisher: string
      trustTier: number
      url: string
      ok: boolean
      items: number
      error?: string
    }>
    sourcesChecked: number
    sourcesFailed: number
    itemsDiscovered: number
    droppedBeforePersist: number
  }
  pendingPublications?: {
    pending: number
    attempted: number
    created: number
    skipped: number
    publishingBlocked: boolean
  }
  dedupe?: {
    itemsDuplicate: number
    storiesCreated: number
    storiesMerged: number
    candidates: number
    resumedDeferred: number
  }
  selection: { considered: number; classified: StoryCard[]; selected: StoryCard[] }
  stories: StoryState[]
  counters?: Record<string, number>
  llmUsage?: { calls: number; inputTokens: number; outputTokens: number }
  errors: Array<{ step: string; storyId?: string; code: string; message: string }>
  note?: string
  logs: Array<{ at: string; level: string; message: string }>
  summary?: RunSummary
  failure?: { message: string; hint?: string }
}

export interface DemoEnvironment {
  environment: 'LOCAL DEVELOPMENT'
  wordpress: {
    locality: 'local' | 'remote' | 'not-configured'
    apiUrl?: string
    siteUrl?: string
    username?: string
    adminUrl?: string
  }
  llm: {
    provider: string
    apiKeyConfigured: boolean
    modelFast?: string
    modelStrong?: string
  }
  limits: Record<string, number>
  canRun: boolean
  blockedReason?: string
  dryRunOnly: boolean
  sources: Array<{
    id: string
    name: string
    publisher: string
    trustTier: number
    url: string
    enabled: boolean
    note?: string
  }>
}
