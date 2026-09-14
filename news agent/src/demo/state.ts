/*
 * Demo run state: the pipeline's event stream, folded into one snapshot.
 *
 * The dashboard must never guess what the pipeline is doing, so this module is
 * the only thing that interprets events. It applies them in order and holds the
 * result; the HTTP layer either streams the events or serves this snapshot, and
 * both describe exactly the same run.
 *
 * Nothing is computed here that the pipeline did not report. A stage is
 * "waiting" until the pipeline says it started; a summary counts what the
 * pipeline actually produced. There is no inference, no simulation, no filler.
 */

import type {
  DemoArticle,
  DemoClaim,
  DemoEvidence,
  DemoReview,
  DemoStoryCard,
  DemoWordPress,
  PipelineEvent,
  RunStageId,
  StageId,
  StageStatus,
  StoryStageId,
} from '../pipeline/observer.ts'
import type { FormatDecision } from '../editorial/format.ts'
import type { LlmUsage, RunCounters, RunError } from '../domain/types.ts'

/** Run-level stages, in render order, with the NEWS_AGENT.md §7 step numbers. */
export const RUN_STAGES: Array<{ id: RunStageId; label: string; steps: string }> = [
  { id: 'discovery', label: 'Source ingestion', steps: 'steps 2-4' },
  { id: 'dedupe', label: 'Deduplication & clustering', steps: 'step 5' },
  { id: 'selection', label: 'Relevance scoring & selection', steps: 'steps 6-8' },
]

/** Per-story stages, in render order. */
export const STORY_STAGES: Array<{ id: StoryStageId; label: string; steps: string }> = [
  { id: 'evidence', label: 'Evidence gathering', steps: 'step 9' },
  { id: 'claims', label: 'Claim extraction', steps: 'step 10' },
  { id: 'verification', label: 'Claim verification', steps: 'step 11' },
  { id: 'format', label: 'Article format selection', steps: 'step 11b' },
  { id: 'writing', label: 'Article generation', steps: 'step 12' },
  { id: 'editorial', label: 'Editorial validation', steps: 'step 13' },
  { id: 'wordpress', label: 'WordPress draft creation', steps: 'steps 14-16' },
]

export interface StageState {
  id: StageId
  label: string
  steps: string
  status: StageStatus
  startedAt?: string
  finishedAt?: string
  detail?: string
}

export interface DemoStoryState {
  storyId: string
  story: DemoStoryCard
  stages: StageState[]
  evidence?: {
    sources: DemoEvidence[]
    failed: number
    sufficient: boolean
    reason?: string
  }
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
  editorial?: DemoReview
  wordpress?: DemoWordPress
  outcome?: { outcome: string; stage: string; reason?: string; at: string }
}

export interface DemoSummary {
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

export type DemoRunStatus = 'starting' | 'running' | 'completed' | 'failed' | 'skipped'

export interface DemoRunState {
  runId: string
  status: DemoRunStatus
  startedAt: string
  finishedAt?: string
  dryRun: boolean
  provider: string
  limits: Record<string, number>
  /** The CMS this run was pointed at. Always a local host — see demo/environment.ts. */
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
  /** Step 1b — drafts carried over from an earlier run and published now. */
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
  selection: { considered: number; classified: DemoStoryCard[]; selected: DemoStoryCard[] }
  stories: DemoStoryState[]
  counters?: RunCounters
  llmUsage?: LlmUsage
  errors: RunError[]
  note?: string
  /** High-level activity lines, already redacted by the agent's own logger. */
  logs: Array<{ at: string; level: string; message: string }>
  summary?: DemoSummary
  /** Fatal error that stopped the run before it could finish cleanly. */
  failure?: { message: string; hint?: string }
}

const MAX_LOG_LINES = 400

function stagesFrom(
  catalogue: Array<{ id: StageId; label: string; steps: string }>,
): StageState[] {
  return catalogue.map((entry) => ({ ...entry, status: 'waiting' as StageStatus }))
}

export function emptyRunState(runId: string, startedAt: string, dryRun: boolean): DemoRunState {
  return {
    runId,
    status: 'starting',
    startedAt,
    dryRun,
    provider: 'unknown',
    limits: {},
    stages: stagesFrom(RUN_STAGES),
    discovery: {
      sources: [],
      sourcesChecked: 0,
      sourcesFailed: 0,
      itemsDiscovered: 0,
      droppedBeforePersist: 0,
    },
    selection: { considered: 0, classified: [], selected: [] },
    stories: [],
    errors: [],
    logs: [],
  }
}

function storyFor(state: DemoRunState, storyId: string, card?: DemoStoryCard): DemoStoryState {
  let entry = state.stories.find((candidate) => candidate.storyId === storyId)
  if (!entry) {
    entry = {
      storyId,
      story: card ?? {
        storyId,
        title: storyId,
        status: 'candidate',
        firstSeenAt: new Date().toISOString(),
        scores: { relevance: 0, importance: 0, freshness: 0, sourceTrust: 0, weighted: 0 },
        items: [],
      },
      stages: stagesFrom(STORY_STAGES),
      revisions: [],
    }
    state.stories.push(entry)
  }
  if (card) entry.story = card
  return entry
}

function setStage(
  stages: StageState[],
  id: StageId,
  status: StageStatus,
  at: string,
  detail?: string,
): void {
  const stage = stages.find((entry) => entry.id === id)
  if (!stage) return
  stage.status = status
  if (status === 'running') stage.startedAt = at
  else stage.finishedAt = at
  if (detail !== undefined) stage.detail = detail
}

/**
 * Applies one pipeline event to the snapshot.
 *
 * Pure bookkeeping: it mutates `state` and returns nothing. Every field it sets
 * came off an event; none is derived from assumption.
 */
export function applyEvent(state: DemoRunState, event: PipelineEvent): void {
  switch (event.type) {
    case 'run:started':
      state.status = 'running'
      state.provider = event.provider
      state.limits = event.limits
      state.dryRun = event.dryRun
      break

    case 'stage': {
      const stages = event.storyId ? storyFor(state, event.storyId).stages : state.stages
      setStage(stages, event.stage, event.status, event.at, event.detail)
      break
    }

    case 'ingest:source':
      state.discovery.sources.push({
        sourceId: event.sourceId,
        publisher: event.publisher,
        trustTier: event.trustTier,
        url: event.url,
        ok: event.ok,
        items: event.items,
        ...(event.error ? { error: event.error } : {}),
      })
      break

    case 'ingest:completed':
      state.discovery.sourcesChecked = event.sourcesChecked
      state.discovery.sourcesFailed = event.sourcesFailed
      state.discovery.itemsDiscovered = event.itemsDiscovered
      state.discovery.droppedBeforePersist = event.droppedBeforePersist
      break

    case 'pending:completed':
      state.pendingPublications = {
        pending: event.pending,
        attempted: event.attempted,
        created: event.created,
        skipped: event.skipped,
        publishingBlocked: event.publishingBlocked,
      }
      break

    case 'dedupe:completed':
      state.dedupe = {
        itemsDuplicate: event.itemsDuplicate,
        storiesCreated: event.storiesCreated,
        storiesMerged: event.storiesMerged,
        candidates: event.candidates,
        resumedDeferred: event.resumedDeferred,
      }
      break

    case 'classify:story':
      state.selection.classified.push(event.story)
      break

    case 'selection:completed':
      state.selection.considered = event.considered
      state.selection.selected = event.selected
      break

    case 'story:started':
      storyFor(state, event.storyId, event.story)
      break

    case 'story:evidence': {
      const story = storyFor(state, event.storyId)
      story.evidence = {
        sources: event.sources,
        failed: event.failed,
        sufficient: event.sufficient,
        ...(event.reason ? { reason: event.reason } : {}),
      }
      break
    }

    case 'story:claims': {
      const story = storyFor(state, event.storyId)
      story.extraction = {
        claims: event.claims,
        failedSources: event.failedSources,
        injectionFlagged: event.injectionFlagged,
        injectedClaimsDropped: event.injectedClaimsDropped,
      }
      break
    }

    case 'story:verification': {
      const story = storyFor(state, event.storyId)
      story.verification = {
        claims: event.claims,
        ...(event.coreClaimId ? { coreClaimId: event.coreClaimId } : {}),
        sufficient: event.sufficient,
        ...(event.reason ? { reason: event.reason } : {}),
        counts: event.counts,
      }
      break
    }

    case 'story:format':
      storyFor(state, event.storyId).format = event.decision
      break

    case 'story:article':
      storyFor(state, event.storyId).article = event.article
      break

    case 'story:revision':
      storyFor(state, event.storyId).revisions.push({ at: event.at, issues: event.issues })
      break

    case 'story:editorial':
      storyFor(state, event.storyId).editorial = event.review
      break

    case 'story:wordpress': {
      const story = storyFor(state, event.storyId)
      story.wordpress = event.result
      if (event.result.baseUrl) state.wordpressBaseUrl = event.result.baseUrl
      break
    }

    case 'story:outcome':
      storyFor(state, event.storyId).outcome = {
        outcome: event.outcome,
        stage: event.stage,
        ...(event.reason ? { reason: event.reason } : {}),
        at: event.at,
      }
      break

    case 'log':
      state.logs.push({ at: event.at, level: event.level, message: event.message })
      if (state.logs.length > MAX_LOG_LINES) state.logs.splice(0, state.logs.length - MAX_LOG_LINES)
      break

    case 'run:finished':
      state.status = event.status === 'running' ? 'completed' : event.status
      state.finishedAt = event.at
      state.counters = event.counters
      state.llmUsage = event.llmUsage
      state.errors = event.errors
      if (event.note) state.note = event.note
      finalise(state)
      break
  }
}

/**
 * Marks a run that died outside the pipeline's own error handling.
 *
 * The pipeline reports its own failures through `run:finished`; this covers the
 * case where `executePipeline` itself rejected (a configuration error, a
 * database failure) and no terminal event was ever emitted.
 */
export function markFailed(state: DemoRunState, message: string, hint?: string): void {
  state.status = 'failed'
  state.finishedAt = new Date().toISOString()
  state.failure = { message, ...(hint ? { hint } : {}) }
  for (const stage of state.stages) {
    if (stage.status === 'running') stage.status = 'failed'
  }
  for (const story of state.stories) {
    for (const stage of story.stages) {
      if (stage.status === 'running') stage.status = 'failed'
    }
  }
  finalise(state)
}

/** Anything still waiting when the run ended never ran. */
function finalise(state: DemoRunState): void {
  const settle = (stages: StageState[]) => {
    for (const stage of stages) {
      if (stage.status === 'waiting' || stage.status === 'running') {
        stage.status = stage.status === 'running' ? 'failed' : 'skipped'
      }
    }
  }
  settle(state.stages)
  for (const story of state.stories) settle(story.stages)
  state.summary = summarise(state)
}

export function summarise(state: DemoRunState): DemoSummary {
  // The focused story is the one the dashboard renders: the one that got
  // furthest. Article-level figures describe that story, not an average.
  const focus = focusStory(state)
  const checks = focus?.editorial?.checks ?? []

  return {
    sourcesChecked: state.discovery.sourcesChecked,
    sourcesFailed: state.discovery.sourcesFailed,
    itemsDiscovered: state.discovery.itemsDiscovered,
    storiesConsidered: state.selection.considered || state.selection.classified.length,
    storiesSelected: state.selection.selected.length,
    evidenceSources: focus?.evidence?.sources.filter((source) => !source.quarantined).length ?? 0,
    claimsExtracted: focus?.extraction?.claims.length ?? 0,
    claimsVerified: focus?.verification?.counts.verified ?? 0,
    claimsSingleSource: focus?.verification?.counts.singleSource ?? 0,
    claimsUnsupported: focus?.verification?.counts.unsupported ?? 0,
    claimsConflicting: focus?.verification?.counts.conflicting ?? 0,
    ...(focus?.article ? { articleWords: focus.article.wordCount } : {}),
    ...(checks.length > 0
      ? {
          qualityChecksPassed: checks.filter((check) => check.passed).length,
          qualityChecksTotal: checks.length,
        }
      : {}),
    ...(focus?.editorial
      ? { editorialVerdict: focus.editorial.verdict, editorialConfidence: focus.editorial.confidence }
      : {}),
    wordpressStatus: describeWordPress(focus),
    carriedOverDraftsCreated: state.pendingPublications?.created ?? 0,
    llmCalls: state.llmUsage?.calls ?? 0,
    llmTokens: (state.llmUsage?.inputTokens ?? 0) + (state.llmUsage?.outputTokens ?? 0),
  }
}

/** The story the dashboard focuses on: the one that reached the furthest stage. */
export function focusStory(state: DemoRunState): DemoStoryState | undefined {
  if (state.stories.length === 0) return undefined
  const rank = (story: DemoStoryState) =>
    story.stages.filter((stage) => stage.status === 'completed').length
  return [...state.stories].sort((a, b) => rank(b) - rank(a))[0]
}

function describeWordPress(story: DemoStoryState | undefined): string {
  if (!story?.wordpress) return 'Not reached'
  switch (story.wordpress.status) {
    case 'created':
      return `Draft created (post ${story.wordpress.wpPostId})`
    case 'dry-run':
      return 'Dry run — nothing sent'
    case 'skipped':
      return `Skipped: ${story.wordpress.reason ?? 'unknown'}`
    case 'deferred':
      return `Deferred: ${story.wordpress.reason ?? 'unknown'}`
    default:
      return `Failed: ${story.wordpress.reason ?? 'unknown'}`
  }
}
