/*
 * Pipeline observability hook.
 *
 * The pipeline's normal output is a PipelineRun row plus SQLite state: enough to
 * audit a run afterwards, not enough to WATCH one. The demo dashboard needs the
 * intermediate artifacts as they are produced — the evidence that was fetched,
 * the claims that were extracted, what verification did to each one, the format
 * decision, the draft, the editor's verdict.
 *
 * Rather than have the dashboard re-derive that by polling the database (which
 * cannot see the format decision or the editorial review at all, and cannot tell
 * "running" from "not started"), the pipeline emits it.
 *
 * ── Rules this module exists to keep ─────────────────────────────────────────
 *
 * 1. OPTIONAL. `RunOptions.observer` is undefined for the CLI and for every
 *    test, and `emitTo(undefined, ...)` is a no-op. Production behaviour is
 *    byte-identical with no observer attached.
 * 2. NEVER LOAD-BEARING. Emitting is fire-and-forget and wrapped: a throwing
 *    observer cannot fail a run or change a story's outcome.
 * 3. BOUNDED. Source text is excerpted here, not shipped whole. §28 calls
 *    fetched page text untrusted input; a debug UI is not a reason to hand a
 *    browser 200 KB of it.
 * 4. NO SECRETS. Nothing in this file touches env, credentials, prompts or
 *    provider payloads. The event types below are the complete surface.
 */

import type { ArticleFormat } from '../config/limits.ts'
import type { FormatDecision } from '../editorial/format.ts'
import type {
  ArticleDraft,
  Claim,
  CandidateStory,
  SeoBrief,
  LlmUsage,
  RunCounters,
  RunError,
  RunStatus,
  SourceEvidence,
  StoryScores,
  TrustTier,
} from '../domain/types.ts'

/** Run-level stages, in the order the dashboard renders them. */
export type RunStageId = 'discovery' | 'dedupe' | 'selection'

/** Per-story stages, in the order the dashboard renders them. */
export type StoryStageId =
  | 'evidence'
  | 'claims'
  | 'verification'
  | 'format'
  | 'writing'
  | 'editorial'
  | 'wordpress'

export type StageId = RunStageId | StoryStageId

export type StageStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'skipped'

/** How much of a fetched source body the dashboard is allowed to see. */
const EXCERPT_CHARS = 600

export interface DemoStoryCard {
  storyId: string
  title: string
  category?: string
  status: string
  /** Earliest publication date across the story's items, when any source gave one. */
  publishedAt?: string
  firstSeenAt: string
  scores: StoryScores
  /** One entry per news item clustered into this story. */
  items: Array<{
    publisher: string
    sourceId: string
    title: string
    url: string
    publishedAt?: string
    trustTier?: TrustTier
  }>
  /** Classifier rationale, when the classifier ran. */
  reason?: string
  recommendation?: string
  selected?: boolean
  rejectionReason?: string
}

export interface DemoEvidence {
  url: string
  publisher: string
  title: string
  publishedAt?: string
  trustTier: TrustTier
  sourceType: string
  retrievedAt: string
  /** Bounded, script-free text. Never the whole document. */
  excerpt: string
  excerptTruncated: boolean
  factsExtracted: number
  /** Withheld from every model because the page tried to issue instructions (§28). */
  quarantined: boolean
}

export interface DemoClaim {
  id: string
  text: string
  claimType: string
  supportLevel: string
  bestTier?: TrustTier
  conflictNote?: string
  /** Publisher names resolved from the claim's supporting evidence URLs. */
  supportedBy: Array<{ url: string; publisher: string; trustTier?: TrustTier }>
  isCoreClaim?: boolean
}

export interface DemoArticle {
  title: string
  slug: string
  excerpt: string
  category: string
  tags: string[]
  sections: ArticleDraft['sections']
  /** Allowlisted HTML built by generation/render.ts — never model markup. */
  html: string
  wordCount: number
  format: ArticleFormat
  model: string
  generatedAt: string
  revisionCount: number
  sourceUrls: string[]
  claimIds: string[]
  /**
   * The search brief the draft was written against, when the pipeline produced
   * one. Optional because the SEO step is not wired into pipeline/run.ts yet —
   * the dashboard renders this section only when a run actually emits it, and
   * says so plainly when it does not.
   */
  seo?: SeoBrief
}

export interface DemoReview {
  verdict: string
  confidence: number
  issues: string[]
  blockingIssues: string[]
  notes: string
  /** Deterministic checks, resolved to pass/fail for the dashboard's checklist. */
  checks: Array<{ id: string; label: string; passed: boolean; detail?: string }>
}

export interface DemoWordPress {
  status: 'created' | 'skipped' | 'deferred' | 'dry-run' | 'failed'
  wpPostId?: number
  postStatus?: string
  slug?: string
  /** WordPress's own link for the post, when it returned one. */
  link?: string
  /** The CMS base URL the post was created against. Always shown, never a secret. */
  baseUrl?: string
  /** wp-admin editor screen for the post. Added by the demo server, not the pipeline. */
  editorUrl?: string
  createdAt?: string
  reason?: string
}

export type PipelineEvent =
  | {
      type: 'run:started'
      at: string
      runId: string
      dryRun: boolean
      provider: string
      sourcesEnabled: number
      limits: Record<string, number>
    }
  | { type: 'stage'; at: string; stage: StageId; status: StageStatus; storyId?: string; detail?: string }
  | {
      type: 'ingest:source'
      at: string
      sourceId: string
      publisher: string
      trustTier: TrustTier
      url: string
      ok: boolean
      items: number
      error?: string
    }
  | {
      type: 'ingest:completed'
      at: string
      sourcesChecked: number
      sourcesFailed: number
      itemsDiscovered: number
      droppedBeforePersist: number
    }
  | {
      type: 'dedupe:completed'
      at: string
      itemsDuplicate: number
      storiesCreated: number
      storiesMerged: number
      candidates: number
      resumedDeferred: number
    }
  | {
      /*
       * Step 1b: drafts an EARLIER run approved but could not post. These create
       * real WordPress posts without any story passing through this run's
       * stages, so a dashboard that ignored them would report "nothing was sent
       * to WordPress" while posts were being created.
       */
      type: 'pending:completed'
      at: string
      pending: number
      attempted: number
      created: number
      skipped: number
      publishingBlocked: boolean
    }
  | { type: 'classify:story'; at: string; story: DemoStoryCard }
  | { type: 'selection:completed'; at: string; considered: number; selected: DemoStoryCard[] }
  | { type: 'story:started'; at: string; storyId: string; story: DemoStoryCard }
  | {
      type: 'story:evidence'
      at: string
      storyId: string
      sources: DemoEvidence[]
      failed: number
      sufficient: boolean
      reason?: string
    }
  | {
      type: 'story:claims'
      at: string
      storyId: string
      claims: DemoClaim[]
      failedSources: number
      injectionFlagged: boolean
      injectedClaimsDropped: number
    }
  | {
      type: 'story:verification'
      at: string
      storyId: string
      claims: DemoClaim[]
      coreClaimId?: string
      sufficient: boolean
      reason?: string
      counts: { verified: number; singleSource: number; unsupported: number; conflicting: number }
    }
  | { type: 'story:format'; at: string; storyId: string; decision: FormatDecision }
  | { type: 'story:article'; at: string; storyId: string; article: DemoArticle; revision: number }
  | { type: 'story:revision'; at: string; storyId: string; issues: string[] }
  | { type: 'story:editorial'; at: string; storyId: string; review: DemoReview }
  | { type: 'story:wordpress'; at: string; storyId: string; result: DemoWordPress }
  | {
      type: 'story:outcome'
      at: string
      storyId: string
      outcome: 'rejected' | 'retained' | 'published' | 'dry-run' | 'failed'
      stage: StageId | 'story'
      reason?: string
    }
  | { type: 'log'; at: string; level: 'debug' | 'info' | 'warn' | 'error'; message: string }
  | {
      type: 'run:finished'
      at: string
      status: RunStatus
      counters: RunCounters
      llmUsage: LlmUsage
      errors: RunError[]
      note?: string
    }

export interface PipelineObserver {
  emit(event: PipelineEvent): void
}

/**
 * Emits without ever becoming a failure path.
 *
 * A disconnected SSE client or a serialisation bug in the dashboard must not be
 * able to reject a story that the pipeline verified correctly.
 */
export function emitTo(observer: PipelineObserver | undefined, event: PipelineEvent): void {
  if (!observer) return
  try {
    observer.emit(event)
  } catch {
    // Observability is never load-bearing.
  }
}

/* ── projections: domain models → bounded dashboard shapes ────────────────── */

export function toDemoEvidence(evidence: SourceEvidence, quarantined = false): DemoEvidence {
  const text = evidence.cleanedText ?? ''
  return {
    url: evidence.url,
    publisher: evidence.publisher,
    title: evidence.title,
    ...(evidence.publishedAt ? { publishedAt: evidence.publishedAt } : {}),
    trustTier: evidence.trustTier,
    sourceType: evidence.sourceType,
    retrievedAt: evidence.retrievedAt,
    excerpt: text.slice(0, EXCERPT_CHARS),
    excerptTruncated: text.length > EXCERPT_CHARS,
    factsExtracted: evidence.extractedFacts.length,
    quarantined,
  }
}

export function toDemoClaim(
  claim: Claim,
  evidence: SourceEvidence[],
  coreClaimId?: string,
): DemoClaim {
  const byUrl = new Map(evidence.map((item) => [item.url, item]))
  return {
    id: claim.id,
    text: claim.text,
    claimType: claim.claimType,
    supportLevel: claim.supportLevel,
    ...(claim.bestTier ? { bestTier: claim.bestTier } : {}),
    ...(claim.conflictNote ? { conflictNote: claim.conflictNote } : {}),
    supportedBy: claim.evidenceUrls.map((url) => {
      const match = byUrl.get(url)
      return {
        url,
        publisher: match?.publisher ?? hostOf(url),
        ...(match ? { trustTier: match.trustTier } : {}),
      }
    }),
    ...(coreClaimId && claim.id === coreClaimId ? { isCoreClaim: true } : {}),
  }
}

export function toDemoArticle(draft: ArticleDraft): DemoArticle {
  return {
    title: draft.title,
    slug: draft.slug,
    excerpt: draft.excerpt,
    category: draft.category,
    tags: draft.tags,
    sections: draft.sections,
    html: draft.content,
    wordCount: draft.wordCount,
    format: draft.format,
    model: draft.model,
    generatedAt: draft.generatedAt,
    revisionCount: draft.revisionCount,
    sourceUrls: draft.sourceUrls,
    claimIds: draft.claimIds,
    ...(draft.seo ? { seo: draft.seo } : {}),
  }
}

export function toDemoStoryCard(
  story: CandidateStory,
  items: Array<{
    sourceId: string
    title: string
    url: string
    publishedAt?: string
  }>,
  meta: Map<string, { trustTier: TrustTier; publisher: string }>,
  extra: Partial<Pick<DemoStoryCard, 'reason' | 'recommendation' | 'selected'>> = {},
): DemoStoryCard {
  const dates = items
    .map((item) => item.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()

  return {
    storyId: story.id,
    title: story.title,
    ...(story.category ? { category: story.category } : {}),
    status: story.status,
    ...(dates[0] ? { publishedAt: dates[0] } : {}),
    firstSeenAt: story.firstSeenAt,
    scores: story.scores,
    items: items.map((item) => ({
      sourceId: item.sourceId,
      publisher: meta.get(item.sourceId)?.publisher ?? item.sourceId,
      title: item.title,
      url: item.url,
      ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      ...(meta.get(item.sourceId) ? { trustTier: meta.get(item.sourceId)!.trustTier } : {}),
    })),
    ...(story.rejectionReason ? { rejectionReason: story.rejectionReason } : {}),
    ...extra,
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/* ── the quality-control checklist ────────────────────────────────────────── */

/**
 * Resolves the checks the pipeline ACTUALLY performs into a pass/fail list.
 *
 * Every entry below corresponds to a real gate: a deterministic assertion in
 * editorial/validate.ts, a rule in verification/verify.ts, or the Editor model's
 * own verdict. Nothing here is invented for the dashboard's benefit — if a check
 * is not in the pipeline, it is not in this list.
 */
export function buildQualityChecks(input: {
  draft: ArticleDraft
  claims: Claim[]
  issues: string[]
  blockingIssues: string[]
  confidence: number
  minConfidence: number
  minTags: number
  maxTags: number
  minVerifiedClaims: number
  targetMinWords: number
  targetMaxWords: number
}): DemoReview['checks'] {
  const { draft, claims, blockingIssues, issues } = input
  const has = (needle: string) => issues.some((issue) => issue.includes(needle))
  const verified = claims.filter((claim) => claim.supportLevel === 'verified').length
  const usable = claims.filter(
    (claim) => claim.supportLevel === 'verified' || claim.supportLevel === 'single-source',
  ).length
  const modelBlocking = blockingIssues.filter((issue) => issue.includes(': '))

  return [
    {
      id: 'verified-claims',
      label: 'Enough verified claims to write from',
      passed: usable >= input.minVerifiedClaims && verified > 0,
      detail: `${verified} verified, ${usable} usable (minimum ${input.minVerifiedClaims}, at least 1 fully verified)`,
    },
    {
      id: 'claim-traceability',
      label: 'Article cites the claim ids it used',
      passed: draft.claimIds.length > 0,
      detail: `${draft.claimIds.length} claim id(s) referenced`,
    },
    {
      id: 'source-urls',
      label: 'Source URLs recorded on the draft',
      passed: draft.sourceUrls.length > 0,
      detail: `${draft.sourceUrls.length} source URL(s)`,
    },
    {
      id: 'sources-section',
      label: 'Sources section rendered into the article',
      passed: draft.content.includes('<h2>Sources</h2>'),
    },
    {
      id: 'excerpt',
      label: 'Excerpt present and long enough',
      passed: !has('excerpt-too-short'),
      detail: `${draft.excerpt.length} characters`,
    },
    {
      id: 'tags',
      label: 'Tag count within the editorial range',
      passed: draft.tags.length >= input.minTags && draft.tags.length <= input.maxTags,
      detail: `${draft.tags.length} tag(s), allowed ${input.minTags}-${input.maxTags}`,
    },
    {
      id: 'banned-phrases',
      label: 'No banned editorial phrases',
      passed: !has('banned-phrase'),
    },
    {
      id: 'html-allowlist',
      label: 'Only allowlisted HTML tags in the rendered body',
      passed: !has('disallowed-html-tags'),
    },
    {
      id: 'word-count',
      label: 'Word count within the chosen format target',
      passed: !has('below-format-target') && !has('above-format-target'),
      detail: `${draft.wordCount} words, ${draft.format} target ${input.targetMinWords}-${input.targetMaxWords}`,
    },
    {
      id: 'duplicate',
      label: 'Not a duplicate of an already-published article',
      passed: !has('duplicate'),
    },
    {
      id: 'editor-verdict',
      label: 'Editor found no blocking issue',
      passed: modelBlocking.length === 0,
      detail: modelBlocking.length > 0 ? modelBlocking.slice(0, 3).join('; ') : undefined,
    },
    {
      id: 'confidence',
      label: 'Editorial confidence clears the approval floor',
      passed: input.confidence >= input.minConfidence,
      detail: `${input.confidence.toFixed(2)} (floor ${input.minConfidence})`,
    },
  ].map((check) => ({
    id: check.id,
    label: check.label,
    passed: check.passed,
    ...(check.detail ? { detail: check.detail } : {}),
  }))
}
