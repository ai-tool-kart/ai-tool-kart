/*
 * Pipeline orchestration (NEWS_AGENT.md §7).
 *
 * One invocation = one complete run, then the process exits. No daemon, no
 * timers, no long-lived loop.
 *
 * A run has two independent bodies of work: publishing what an earlier run
 * approved but could not post (pipeline/pending.ts, step 1b), and the ingestion
 * pipeline proper. The first is deliberately not gated on the second, because a
 * pending draft's news items are already deduped and will never re-enter
 * generation.
 *
 * Failure isolation is the structural rule. Steps 9-16 run per story inside a
 * try/catch: a story that fails is marked with a reason and the run continues.
 * Only two things abort a run — failing to take the run lock, and a database
 * failure, because dedupe bookkeeping is what prevents duplicate drafts.
 */

import type { AgentEnv } from '../config/env.ts'
import { isEditorialCategory, type EditorialCategory } from '../config/editorial.ts'
import { isAgentError } from '../domain/errors.ts'
import {
  emptyCounters,
  emptyUsage,
  type CandidateStory,
  type NewsItem,
  type NewsSource,
  type PipelineRun,
  type RunError,
  type TrustTier,
} from '../domain/types.ts'
import { clusterItems } from '../dedupe/cluster.ts'
import { extractClaims } from '../evidence/extract.ts'
import { evidenceIsSufficient, gatherEvidence, type GatherDeps } from '../evidence/gather.ts'
import { canRevise, validateDraft } from '../editorial/validate.ts'
import { ARTICLE, MIN_APPROVAL_CONFIDENCE, MIN_VERIFIED_CLAIMS } from '../config/limits.ts'
import { selectArticleFormat } from '../editorial/format.ts'
import { buildSeoBrief } from '../seo/brief.ts'
import { deriveEntityHints } from '../editorial/tags.ts'
import { writeArticle } from '../generation/write.ts'
import { ingestSources, type IngestDeps } from '../ingestion/ingest.ts'
import { createBudget } from '../llm/budget.ts'
import { createLLMClient } from '../llm/client.ts'
import { createProvider } from '../llm/factory.ts'
import { ClassificationSchema } from '../llm/schemas.ts'
import { CLASSIFIER_SYSTEM, classifierUserPrompt } from '../llm/prompts/index.ts'
import type { MockProviderOptions } from '../llm/providers/mock.ts'
import {
  buildQualityChecks,
  emitTo,
  toDemoArticle,
  toDemoClaim,
  toDemoEvidence,
  toDemoStoryCard,
  type PipelineObserver,
} from './observer.ts'
import { retryPendingPublications } from './pending.ts'
import { prefilterStory } from '../ranking/prefilter.ts'
import { computeScores, selectStory } from '../ranking/score.ts'
import { enabledSources, SOURCES } from '../sources/registry.ts'
import type { Repositories } from '../storage/repositories.ts'
import { errorFields, type Logger } from '../utils/logger.ts'
import { hoursSince, nowIso, systemClock, type Clock } from '../utils/time.ts'
import { verifyClaims } from '../verification/verify.ts'
import { createWordPressClient, type WordPressClient } from '../wordpress/client.ts'
import { isPublishingBlocked, publishDraft } from '../wordpress/publish.ts'
import { createTaxonomyResolver } from '../wordpress/taxonomy.ts'
import { articleId as makeArticleId, runId as makeRunId } from '../utils/ids.ts'

export interface RunOptions {
  env: AgentEnv
  repos: Repositories
  logger: Logger
  dryRun: boolean
  /** Restrict ingestion to one source id. */
  sourceId?: string
  /** Cap articles generated this run, below the configured limit. */
  limit?: number
  /** Test seams. */
  sources?: NewsSource[]
  ingest?: Pick<IngestDeps, 'fetchFeed'>
  gather?: Pick<GatherDeps, 'fetchPage'>
  mock?: MockProviderOptions
  wordPressClient?: WordPressClient
  /**
   * Editorial "now" for story age, freshness and the dedupe window. Defaults
   * to the real clock; tests pin it so fixtures with absolute publication
   * dates stay fresh without weakening the production freshness rule.
   * Run-lock staleness deliberately keeps using real wall-clock time.
   */
  clock?: Clock
  /**
   * Demo/debug observability sink (pipeline/observer.ts).
   *
   * Undefined for the CLI and for every test, and emitting through it can
   * neither fail nor alter a run. Attaching one changes what the pipeline
   * REPORTS, never what it does.
   */
  observer?: PipelineObserver
}

export interface RunResult {
  run: PipelineRun
  /** Exit code: non-zero only when the run itself failed, not when stories were rejected. */
  exitCode: number
}

export async function executePipeline(options: RunOptions): Promise<RunResult> {
  const { env, repos, logger, dryRun, clock = systemClock, observer } = options
  // Run bookkeeping uses real time: the run lock measures process liveness.
  const startedAt = nowIso()

  const run: PipelineRun = {
    id: makeRunId(),
    startedAt,
    status: 'running',
    dryRun,
    counters: emptyCounters(),
    llmUsage: emptyUsage(),
    errors: [],
  }

  const log = logger.child({ runId: run.id })

  /* ── Step 1: run lock ──────────────────────────────────────────────────── */
  const lock = repos.runs.claimLock(run, env.runLockStaleMinutes)
  if (!lock.acquired) {
    run.status = 'skipped'
    run.finishedAt = nowIso()
    run.note = `Another run (${lock.heldBy.id}) is active since ${lock.heldBy.startedAt}`
    log.warn('Run skipped: lock held by an active run', {
      heldBy: lock.heldBy.id,
      since: lock.heldBy.startedAt,
    })
    emitTo(options.observer, {
      type: 'run:finished',
      at: run.finishedAt,
      status: run.status,
      counters: run.counters,
      llmUsage: run.llmUsage,
      errors: run.errors,
      ...(run.note ? { note: run.note } : {}),
    })
    return { run, exitCode: 0 }
  }

  emitTo(observer, {
    type: 'run:started',
    at: startedAt,
    runId: run.id,
    dryRun,
    provider: env.llm.provider,
    sourcesEnabled: (options.sources ?? SOURCES).filter((source) => source.enabled).length,
    limits: { ...env.limits, minWeightedScore: env.minWeightedScore },
  })

  const budget = createBudget(env.limits)
  const provider = createProvider({ env, ...(options.mock ? { mock: options.mock } : {}) })
  const llm = createLLMClient({ provider, budget, logger: log })

  const addError = (step: string, error: unknown, extra: Partial<RunError> = {}): void => {
    run.errors.push({
      step,
      code: isAgentError(error) ? error.code : 'UNKNOWN',
      message: error instanceof Error ? error.message : String(error),
      ...extra,
    })
  }

  try {
    /* ── WordPress client (only if configured) ───────────────────────────── */
    let wordpress: WordPressClient | undefined = options.wordPressClient
    if (!wordpress && env.wordpress && !dryRun) {
      wordpress = createWordPressClient({
        credentials: env.wordpress,
        logger: log,
        timeoutMs: env.http.timeoutMs,
        userAgent: env.http.userAgent,
      })
    }
    let publishingBlocked = false

    /* ── Step 1b: publish what an earlier run approved but could not post ──
     *
     * Runs before ingestion, and independently of it. See pipeline/pending.ts
     * for why: a pending draft is finished editorial work that costs no LLM
     * budget to publish, nothing upstream will ever re-offer it once its news
     * items are deduped, and an auth failure found here disables publishing
     * before the run spends its budget generating posts it cannot deliver.
     */
    const pending = await retryPendingPublications({
      env,
      repos,
      logger: log,
      run,
      dryRun,
      addError,
      ...(wordpress ? { wordpress } : {}),
    })
    run.counters.pendingRetried = pending.attempted
    if (pending.publishingBlocked) publishingBlocked = true

    emitTo(observer, {
      type: 'pending:completed',
      at: nowIso(),
      pending: pending.pending,
      attempted: pending.attempted,
      created: pending.created,
      skipped: pending.skipped,
      publishingBlocked: pending.publishingBlocked,
    })

    // Tests inject a fixture registry; production reads the real one.
    const registry = options.sources ?? SOURCES
    repos.sources.sync(registry)

    /* ── Steps 2-4: ingest ───────────────────────────────────────────────── */
    const sources = options.sources
      ? options.sources.filter(
          (source) => source.enabled && (!options.sourceId || source.id === options.sourceId),
        )
      : enabledSources(options.sourceId)
    if (sources.length === 0) {
      log.warn('No enabled sources matched', { sourceId: options.sourceId })
    }

    emitTo(observer, { type: 'stage', at: nowIso(), stage: 'discovery', status: 'running' })

    const ingested = await ingestSources(sources, {
      env,
      logger: log,
      clock,
      ...(options.ingest?.fetchFeed ? { fetchFeed: options.ingest.fetchFeed } : {}),
      ...(observer
        ? {
            onSource: (outcome) =>
              emitTo(observer, {
                type: 'ingest:source',
                at: nowIso(),
                sourceId: outcome.source.id,
                publisher: outcome.source.publisher,
                trustTier: outcome.source.trustTier,
                url: outcome.source.url,
                ok: outcome.ok,
                items: outcome.accepted,
                ...(outcome.error ? { error: outcome.error } : {}),
              }),
          }
        : {}),
    })

    run.counters.sourcesChecked = ingested.sourcesChecked
    run.counters.sourcesFailed = ingested.sourcesFailed
    run.counters.itemsDiscovered = ingested.items.length

    emitTo(observer, {
      type: 'ingest:completed',
      at: nowIso(),
      sourcesChecked: ingested.sourcesChecked,
      sourcesFailed: ingested.sourcesFailed,
      itemsDiscovered: ingested.items.length,
      droppedBeforePersist: ingested.droppedBeforePersist,
    })
    emitTo(observer, { type: 'stage', at: nowIso(), stage: 'discovery', status: 'completed' })

    for (const source of sources) {
      // Bookkeeping only; a failure here has already been logged and isolated.
      repos.sources.recordFetch(source.id, true, 'ok')
    }

    /* ── Step 5: dedupe and cluster ──────────────────────────────────────── */
    emitTo(observer, { type: 'stage', at: nowIso(), stage: 'dedupe', status: 'running' })
    const clustered = clusterItems(ingested.items, { repos, logger: log, runId: run.id, clock })
    run.counters.itemsDuplicate = clustered.itemsDuplicate + ingested.droppedBeforePersist

    /*
     * Work deferred by an earlier run's caps rejoins the queue here.
     *
     * §27 promises that deferring is not rejecting: "Deferred stories remain
     * candidates for the next run." Clustering alone cannot keep that promise.
     * It only yields stories built from THIS run's non-duplicate items, and a
     * deferred story's items were persisted and marked seen the moment it was
     * first clustered — so it can never re-cluster, and no later run would ever
     * look at it again. The tighter the caps, the more finished ingestion work
     * was silently stranded.
     *
     * Deferred stories go FIRST because listByStatus orders by weighted score,
     * so anything already classified outranks an unscored newcomer. They are not
     * resurrected unconditionally: every one still goes through prefilterStory
     * below, which re-checks staleness against the current clock, so a deferral
     * that aged out is rejected on this pass rather than lingering forever.
     */
    const deferred = repos.stories.listByStatus('deferred')
    const candidates = [...deferred, ...clustered.stories]
    if (deferred.length > 0) {
      log.info('Resuming stories deferred by an earlier run', { count: deferred.length })
    }

    run.counters.storiesCandidate = candidates.length

    emitTo(observer, {
      type: 'dedupe:completed',
      at: nowIso(),
      itemsDuplicate: run.counters.itemsDuplicate,
      storiesCreated: clustered.storiesCreated,
      storiesMerged: clustered.storiesMerged,
      candidates: candidates.length,
      resumedDeferred: deferred.length,
    })
    emitTo(observer, { type: 'stage', at: nowIso(), stage: 'dedupe', status: 'completed' })

    const tierBySourceId = new Map<string, TrustTier>(
      registry.map((source) => [source.id, source.trustTier]),
    )
    const sourceMeta = new Map(
      registry.map((source) => [
        source.id,
        { trustTier: source.trustTier, publisher: source.publisher },
      ]),
    )

    /* ── Steps 6-8: prefilter, classify, score, select ───────────────────── */
    const scored: Array<{ story: CandidateStory; items: NewsItem[]; category: EditorialCategory }> = []

    emitTo(observer, { type: 'stage', at: nowIso(), stage: 'selection', status: 'running' })

    for (const story of candidates) {
      const items = repos.newsItems.listByIds(story.newsItemIds)
      const storyLog = log.child({ storyId: story.id })

      const prefilter = prefilterStory({ story, items, tierBySourceId, clock })
      if (!prefilter.pass) {
        repos.stories.setStatus(story.id, 'rejected', prefilter.reason)
        run.counters.itemsRejected += items.length
        storyLog.debug('Story rejected by prefilter', { reason: prefilter.reason })
        emitTo(observer, {
          type: 'classify:story',
          at: nowIso(),
          story: toDemoStoryCard({ ...story, status: 'rejected', rejectionReason: prefilter.reason }, items, sourceMeta, {
            selected: false,
          }),
        })
        continue
      }

      if (scored.length >= env.limits.maxCandidatesPerRun || budget.exhausted()) {
        repos.stories.setStatus(story.id, 'deferred', 'candidate-budget-reached')
        run.counters.storiesDeferred += 1
        continue
      }

      const tiers = items
        .map((item) => tierBySourceId.get(item.sourceId))
        .filter((tier): tier is TrustTier => tier !== undefined)
      const ageHours = Math.min(
        ...items.map((item) => hoursSince(item.publishedAt ?? item.discoveredAt, clock.now())),
      )

      let classification
      try {
        const response = await llm.run({
          task: 'classify',
          system: CLASSIFIER_SYSTEM,
          user: classifierUserPrompt({
            title: story.title,
            summaries: items
              .filter((item) => item.rawSummary)
              .map((item) => ({ publisher: item.sourceId, text: item.rawSummary as string })),
            publishers: [...new Set(items.map((item) => item.sourceId))],
            ageHours,
            bestTier: tiers.length > 0 ? Math.min(...tiers) : 3,
          }),
          schema: ClassificationSchema,
          schemaName: 'Classification',
          temperature: 0,
        })
        classification = response.data
      } catch (error) {
        if (isAgentError(error) && error.code === 'BUDGET_EXCEEDED') {
          repos.stories.setStatus(story.id, 'deferred', 'llm-budget-exhausted')
          run.counters.storiesDeferred += 1
          storyLog.warn('Deferring story: LLM budget exhausted')
          continue
        }
        /*
         * A fatal error is not a property of this story — a rejected LLM
         * credential fails identically for every candidate. Isolating it here
         * would reject the whole queue one doomed API call at a time, so it
         * aborts the run instead, exactly as it does in the per-story loop below.
         */
        if (isAgentError(error) && error.fatal) throw error
        addError('classify', error, { storyId: story.id })
        repos.stories.setStatus(story.id, 'rejected', 'classification-failed')
        storyLog.warn('Classification failed', errorFields(error))
        continue
      }

      const scores = computeScores({
        relevance: classification.relevance,
        importance: classification.importance,
        ageHours,
        tiers,
        independentPublishers: prefilter.independentPublishers,
        topicAdjustment: prefilter.topicAdjustment,
      })

      const category = isEditorialCategory(classification.category)
        ? classification.category
        : 'industry'

      repos.stories.upsert({ ...story, scores, category, lastUpdatedAt: clock.nowIso() })

      const selection = selectStory({
        weighted: scores.weighted,
        relevance: scores.relevance,
        importance: scores.importance,
        hasTier1: prefilter.hasTier1,
        independentPublishers: prefilter.independentPublishers,
        minWeightedScore: env.minWeightedScore,
      })

      if (!selection.selected) {
        repos.stories.setStatus(story.id, 'rejected', selection.reason)
        storyLog.info('Story not selected', {
          reason: selection.reason,
          weighted: Number(scores.weighted.toFixed(2)),
        })
        emitTo(observer, {
          type: 'classify:story',
          at: nowIso(),
          story: toDemoStoryCard(
            { ...story, scores, category, status: 'rejected', rejectionReason: selection.reason },
            items,
            sourceMeta,
            {
              selected: false,
              ...(classification.reasoning ? { reason: classification.reasoning } : {}),
              ...(classification.recommendation ? { recommendation: classification.recommendation } : {}),
            },
          ),
        })
        continue
      }

      storyLog.info('Story selected', {
        weighted: Number(scores.weighted.toFixed(2)),
        category,
        recommendation: classification.recommendation,
      })
      emitTo(observer, {
        type: 'classify:story',
        at: nowIso(),
        story: toDemoStoryCard({ ...story, scores, category, status: 'candidate' }, items, sourceMeta, {
          selected: true,
          ...(classification.reasoning ? { reason: classification.reasoning } : {}),
          ...(classification.recommendation ? { recommendation: classification.recommendation } : {}),
        }),
      })
      scored.push({ story: { ...story, scores, category }, items, category })
    }

    // Highest scoring first, so caps spend the budget on the best material.
    scored.sort((a, b) => b.story.scores.weighted - a.story.scores.weighted)

    emitTo(observer, {
      type: 'selection:completed',
      at: nowIso(),
      considered: candidates.length,
      selected: scored.map((entry) =>
        toDemoStoryCard({ ...entry.story, status: 'candidate' }, entry.items, sourceMeta, { selected: true }),
      ),
    })
    emitTo(observer, { type: 'stage', at: nowIso(), stage: 'selection', status: 'completed' })

    const maxArticles = Math.min(options.limit ?? Number.POSITIVE_INFINITY, env.limits.maxArticlesPerRun)

    /* ── Steps 9-16: per story, isolated ─────────────────────────────────── */
    let verifiedCount = 0

    for (const candidate of scored) {
      const { story, items, category } = candidate
      const storyLog = log.child({ storyId: story.id })

      if (verifiedCount >= env.limits.maxStoriesVerifiedPerRun) {
        repos.stories.setStatus(story.id, 'deferred', 'verification-budget-reached')
        run.counters.storiesDeferred += 1
        continue
      }
      if (run.counters.articlesGenerated >= maxArticles) {
        repos.stories.setStatus(story.id, 'deferred', 'article-budget-reached')
        run.counters.storiesDeferred += 1
        continue
      }
      if (budget.exhausted()) {
        repos.stories.setStatus(story.id, 'deferred', 'llm-budget-exhausted')
        run.counters.storiesDeferred += 1
        continue
      }

      try {
        verifiedCount += 1
        const outcome = await processStory({
          story,
          items,
          category,
          env,
          repos,
          llm,
          logger: storyLog,
          run,
          dryRun,
          sourceMeta,
          ...(wordpress && !publishingBlocked ? { wordpress } : {}),
          ...(options.gather?.fetchPage ? { fetchPage: options.gather.fetchPage } : {}),
          ...(observer ? { observer } : {}),
        })
        if (outcome === 'publishing-blocked') publishingBlocked = true
      } catch (error) {
        if (isAgentError(error) && error.fatal) throw error

        if (isPublishingBlocked(error)) {
          publishingBlocked = true
          addError('publish', error, { storyId: story.id })
          storyLog.error('WordPress authentication failed; publishing disabled for this run', errorFields(error))
          emitTo(observer, {
            type: 'stage',
            at: nowIso(),
            stage: 'wordpress',
            status: 'failed',
            storyId: story.id,
            detail: 'WordPress rejected the agent credentials (401/403). Publishing is disabled for this run.',
          })
          emitTo(observer, {
            type: 'story:outcome',
            at: nowIso(),
            storyId: story.id,
            outcome: 'failed',
            stage: 'wordpress',
            reason: error instanceof Error ? error.message : String(error),
          })
          continue
        }

        addError('story', error, { storyId: story.id })
        repos.stories.setStatus(story.id, 'rejected', `error: ${(error as Error).message}`.slice(0, 300))
        storyLog.warn('Story failed and was isolated', errorFields(error))
        emitTo(observer, {
          type: 'story:outcome',
          at: nowIso(),
          storyId: story.id,
          outcome: 'failed',
          stage: 'story',
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    run.llmUsage = { ...budget.usage }
    run.status = 'completed'
    run.finishedAt = nowIso()
    emitTo(observer, {
      type: 'run:finished',
      at: run.finishedAt,
      status: run.status,
      counters: run.counters,
      llmUsage: run.llmUsage,
      errors: run.errors,
    })
  } catch (error) {
    run.llmUsage = { ...budget.usage }
    run.status = 'failed'
    run.finishedAt = nowIso()
    run.note = error instanceof Error ? error.message : String(error)
    addError('run', error)
    log.error('Run failed', errorFields(error))
    emitTo(observer, {
      type: 'run:finished',
      at: run.finishedAt,
      status: run.status,
      counters: run.counters,
      llmUsage: run.llmUsage,
      errors: run.errors,
      ...(run.note ? { note: run.note } : {}),
    })
    repos.runs.finish(run)
    return { run, exitCode: 1 }
  }

  repos.runs.finish(run)
  return { run, exitCode: 0 }
}

/* ── one story, end to end ────────────────────────────────────────────────── */

interface ProcessStoryDeps {
  story: CandidateStory
  items: NewsItem[]
  category: EditorialCategory
  env: AgentEnv
  repos: Repositories
  llm: ReturnType<typeof createLLMClient>
  logger: Logger
  run: PipelineRun
  dryRun: boolean
  sourceMeta: Map<string, { trustTier: TrustTier; publisher: string }>
  wordpress?: WordPressClient
  fetchPage?: (url: string) => Promise<string>
  observer?: PipelineObserver
}

async function processStory(deps: ProcessStoryDeps): Promise<'ok' | 'publishing-blocked'> {
  const { story, items, category, env, repos, llm, logger, run, dryRun, wordpress, observer } = deps

  emitTo(observer, {
    type: 'story:started',
    at: nowIso(),
    storyId: story.id,
    story: toDemoStoryCard({ ...story, status: 'candidate' }, items, deps.sourceMeta, { selected: true }),
  })

  /* Step 9: evidence */
  emitTo(observer, { type: 'stage', at: nowIso(), stage: 'evidence', status: 'running', storyId: story.id })
  repos.stories.setEvidenceState(story.id, 'gathering')
  const gathered = await gatherEvidence(story, items, {
    env,
    logger,
    sourceMeta: deps.sourceMeta,
    ...(deps.fetchPage ? { fetchPage: deps.fetchPage } : {}),
  })

  // Quarantined sources are persisted so the audit trail shows what was
  // withheld and why, but they never reach a model or an article.
  for (const suspect of gathered.quarantined) repos.evidence.upsert(suspect)

  const sufficiency = evidenceIsSufficient(gathered.evidence)

  emitTo(observer, {
    type: 'story:evidence',
    at: nowIso(),
    storyId: story.id,
    sources: [
      ...gathered.evidence.map((item) => toDemoEvidence(item)),
      ...gathered.quarantined.map((item) => toDemoEvidence(item, true)),
    ],
    failed: gathered.failed,
    sufficient: sufficiency.sufficient,
    ...(sufficiency.reason ? { reason: sufficiency.reason } : {}),
  })
  emitTo(observer, {
    type: 'stage',
    at: nowIso(),
    stage: 'evidence',
    status: sufficiency.sufficient ? 'completed' : 'failed',
    storyId: story.id,
    ...(sufficiency.reason ? { detail: sufficiency.reason } : {}),
  })

  if (!sufficiency.sufficient) {
    repos.stories.setEvidenceState(story.id, 'insufficient')
    const reason =
      gathered.quarantined.length > 0
        ? `${sufficiency.reason} (${gathered.quarantined.length} source(s) quarantined for prompt injection)`
        : sufficiency.reason
    repos.stories.setStatus(story.id, 'rejected', reason)
    logger.info('Story rejected: insufficient evidence', { reason })
    emitTo(observer, {
      type: 'story:outcome',
      at: nowIso(),
      storyId: story.id,
      outcome: 'rejected',
      stage: 'evidence',
      reason,
    })
    return 'ok'
  }

  for (const evidence of gathered.evidence) repos.evidence.upsert(evidence)
  repos.stories.setEvidenceState(story.id, 'sufficient')

  /* Step 10: claim extraction */
  emitTo(observer, { type: 'stage', at: nowIso(), stage: 'claims', status: 'running', storyId: story.id })
  const extraction = await extractClaims(gathered.evidence, { llm, logger })

  emitTo(observer, {
    type: 'story:claims',
    at: nowIso(),
    storyId: story.id,
    claims: extraction.claims.map((claim) => toDemoClaim(claim, gathered.evidence)),
    failedSources: extraction.failedSources,
    injectionFlagged: extraction.injectionFlagged,
    injectedClaimsDropped: extraction.injectedClaimsDropped,
  })
  emitTo(observer, {
    type: 'stage',
    at: nowIso(),
    stage: 'claims',
    status: extraction.claims.length > 0 ? 'completed' : 'failed',
    storyId: story.id,
    ...(extraction.claims.length === 0 ? { detail: 'no-claims-extracted' } : {}),
  })

  if (extraction.claims.length === 0) {
    repos.stories.setStatus(story.id, 'rejected', 'no-claims-extracted')
    logger.info('Story rejected: no claims extracted')
    emitTo(observer, {
      type: 'story:outcome',
      at: nowIso(),
      storyId: story.id,
      outcome: 'rejected',
      stage: 'claims',
      reason: 'no-claims-extracted',
    })
    return 'ok'
  }

  /* Step 11: verification */
  emitTo(observer, { type: 'stage', at: nowIso(), stage: 'verification', status: 'running', storyId: story.id })
  const verification = await verifyClaims(story.title, extraction.claims, gathered.evidence, {
    llm,
    logger,
  })
  repos.claims.replaceForStory(story.id, verification.claims)

  emitTo(observer, {
    type: 'story:verification',
    at: nowIso(),
    storyId: story.id,
    claims: verification.claims.map((claim) =>
      toDemoClaim(claim, gathered.evidence, verification.coreClaimId),
    ),
    ...(verification.coreClaimId ? { coreClaimId: verification.coreClaimId } : {}),
    sufficient: verification.sufficient,
    ...(verification.reason ? { reason: verification.reason } : {}),
    counts: {
      verified: verification.claims.filter((claim) => claim.supportLevel === 'verified').length,
      singleSource: verification.claims.filter((claim) => claim.supportLevel === 'single-source').length,
      unsupported: verification.claims.filter((claim) => claim.supportLevel === 'unsupported').length,
      conflicting: verification.conflicts.length,
    },
  })
  emitTo(observer, {
    type: 'stage',
    at: nowIso(),
    stage: 'verification',
    status: verification.sufficient ? 'completed' : 'failed',
    storyId: story.id,
    ...(verification.reason ? { detail: verification.reason } : {}),
  })

  if (verification.conflicts.length > 0) {
    repos.stories.setEvidenceState(story.id, 'conflicting')
  }

  if (!verification.sufficient) {
    repos.stories.setStatus(story.id, 'rejected', verification.reason)
    logger.info('Story rejected at verification', { reason: verification.reason })
    emitTo(observer, {
      type: 'story:outcome',
      at: nowIso(),
      storyId: story.id,
      outcome: 'rejected',
      stage: 'verification',
      ...(verification.reason ? { reason: verification.reason } : {}),
    })
    return 'ok'
  }

  repos.stories.setStatus(story.id, 'verified')
  run.counters.storiesVerified += 1

  /*
   * Step 11b: choose the article format from the evidence, before writing.
   *
   * Deterministic and computed once. The writer is told the range as a
   * constraint and the editor judges against the same one, so a revision can
   * never drift into a different length band (§15).
   */
  const formatDecision = selectArticleFormat({
    claims: verification.claims,
    evidence: gathered.evidence,
    importance: story.scores.importance,
  })
  logger.info('Article format selected', {
    format: formatDecision.format,
    target: `${formatDecision.targetMinWords}-${formatDecision.targetMaxWords}`,
    reason: formatDecision.reason,
    ...formatDecision.signals,
  })

  emitTo(observer, { type: 'story:format', at: nowIso(), storyId: story.id, decision: formatDecision })
  emitTo(observer, { type: 'stage', at: nowIso(), stage: 'format', status: 'completed', storyId: story.id })

  /*
   * Step 11c: SEO brief.
   *
   * Positioned after verification and before writing so it can shape how the
   * article is found without any power to change what it says. Failure is
   * non-fatal — an article without a brief ranks less well, which is a far
   * better outcome than losing a verified story to a metadata call.
   */
  const seoBrief = await buildSeoBrief(
    {
      storyTitle: story.title,
      category,
      format: formatDecision.format,
      claims: verification.claims,
      evidence: gathered.evidence,
      entities: deriveEntityHints(story.title, verification.claims),
      publishedArticles: repos.articles.listPublishedSlugs(20),
    },
    { llm, logger },
  )
  if (seoBrief) run.counters.seoBriefsCreated += 1

  /* Steps 12-13: write, review, bounded revision */
  const existing = repos.articles.findByStory(story.id)
  // The article's own row must be excluded from the collision check, or a
  // regenerated story would collide with itself and drift to a "-2" slug.
  const thisArticleId = makeArticleId(story.id)
  emitTo(observer, { type: 'stage', at: nowIso(), stage: 'writing', status: 'running', storyId: story.id })
  let draft = await writeArticle(
    {
      story,
      claims: verification.claims,
      evidence: gathered.evidence,
      category,
      format: formatDecision.format,
      ...(seoBrief ? { seo: seoBrief } : {}),
      ...(existing?.slug ? { existingSlug: existing.slug } : {}),
    },
    {
      llm,
      logger,
      isSlugTaken: (slug) => repos.articles.slugTaken(slug, thisArticleId),
    },
  )
  run.counters.articlesGenerated += 1

  emitTo(observer, {
    type: 'story:article',
    at: nowIso(),
    storyId: story.id,
    article: toDemoArticle(draft),
    revision: 0,
  })
  emitTo(observer, { type: 'stage', at: nowIso(), stage: 'writing', status: 'completed', storyId: story.id })

  const publishedTitles = repos.articles.listPublishedTitles(100).map((entry) => entry.title)

  emitTo(observer, { type: 'stage', at: nowIso(), stage: 'editorial', status: 'running', storyId: story.id })
  let review = await validateDraft(
    { draft, claims: verification.claims, evidence: gathered.evidence, publishedTitles },
    { llm, logger },
  )

  // Only rewrite when the writer can actually change the outcome; otherwise the
  // revision pass spends two LLM calls reproducing the same draft.
  if (
    review.verdict === 'needs-revision' &&
    review.writerFixableIssues.length > 0 &&
    canRevise(draft.revisionCount)
  ) {
    logger.info('Requesting one revision', { issues: review.writerFixableIssues.slice(0, 3) })
    emitTo(observer, {
      type: 'story:revision',
      at: nowIso(),
      storyId: story.id,
      issues: review.writerFixableIssues,
    })
    emitTo(observer, { type: 'stage', at: nowIso(), stage: 'writing', status: 'running', storyId: story.id })
    draft = await writeArticle(
      {
        story,
        claims: verification.claims,
        evidence: gathered.evidence,
        category,
        // Same format as the first pass: a rewrite fixes issues, it does not
        // renegotiate how long the article is allowed to be.
        format: formatDecision.format,
        // Same brief on the rewrite: a revision fixes issues, it does not
        // re-negotiate the keyword strategy.
        ...(seoBrief ? { seo: seoBrief } : {}),
        revisionNotes: review.writerFixableIssues,
        existingSlug: draft.slug,
        revisionCount: draft.revisionCount + 1,
      },
      { llm, logger, isSlugTaken: (slug) => repos.articles.slugTaken(slug, draft.id) },
    )
    emitTo(observer, {
      type: 'story:article',
      at: nowIso(),
      storyId: story.id,
      article: toDemoArticle(draft),
      revision: draft.revisionCount,
    })
    emitTo(observer, { type: 'stage', at: nowIso(), stage: 'writing', status: 'completed', storyId: story.id })
    review = await validateDraft(
      { draft, claims: verification.claims, evidence: gathered.evidence, publishedTitles },
      { llm, logger },
    )
  }

  draft = {
    ...draft,
    confidence: review.confidence,
    editorialStatus: review.verdict === 'approved' ? 'approved' : review.verdict,
    editorialNotes: review.notes,
    editorialIssues: review.issues,
  }

  /*
   * Rejected drafts are persisted too. Tuning the pipeline is impossible without
   * being able to read what it threw away and why (§30 of the brief).
   */
  repos.articles.upsert(draft, run.id)

  emitTo(observer, {
    type: 'story:editorial',
    at: nowIso(),
    storyId: story.id,
    review: {
      verdict: review.verdict,
      confidence: review.confidence,
      issues: review.issues,
      blockingIssues: review.blockingIssues,
      notes: review.notes,
      checks: buildQualityChecks({
        draft,
        claims: verification.claims,
        issues: review.issues,
        blockingIssues: review.blockingIssues,
        confidence: review.confidence,
        minConfidence: MIN_APPROVAL_CONFIDENCE,
        minTags: ARTICLE.minTags,
        maxTags: ARTICLE.maxTags,
        minVerifiedClaims: MIN_VERIFIED_CLAIMS,
        targetMinWords: formatDecision.targetMinWords,
        targetMaxWords: formatDecision.targetMaxWords,
      }),
    },
  })
  emitTo(observer, {
    type: 'stage',
    at: nowIso(),
    stage: 'editorial',
    status: review.verdict === 'approved' ? 'completed' : 'failed',
    storyId: story.id,
    detail: `${review.verdict} (confidence ${review.confidence.toFixed(2)})`,
  })

  if (review.verdict !== 'approved') {
    repos.stories.setStatus(story.id, 'generated', `editorial:${review.verdict}`)
    logger.info('Draft not approved; retained for review', {
      verdict: review.verdict,
      confidence: review.confidence,
      blocking: review.blockingIssues.length,
    })
    emitTo(observer, {
      type: 'stage',
      at: nowIso(),
      stage: 'wordpress',
      status: 'skipped',
      storyId: story.id,
      detail: 'The editor did not approve the draft, so nothing was sent to WordPress.',
    })
    emitTo(observer, {
      type: 'story:outcome',
      at: nowIso(),
      storyId: story.id,
      outcome: 'retained',
      stage: 'editorial',
      reason: `editorial:${review.verdict}`,
    })
    return 'ok'
  }

  run.counters.articlesApproved += 1
  repos.stories.setStatus(story.id, 'generated')

  /* Steps 14-16: WordPress draft */
  emitTo(observer, { type: 'stage', at: nowIso(), stage: 'wordpress', status: 'running', storyId: story.id })

  if (!wordpress && !dryRun) {
    logger.warn('WordPress is not configured; approved draft retained for a later run', {
      articleId: draft.id,
    })
    emitTo(observer, {
      type: 'story:wordpress',
      at: nowIso(),
      storyId: story.id,
      result: { status: 'deferred', reason: 'wordpress-not-configured' },
    })
    emitTo(observer, {
      type: 'stage',
      at: nowIso(),
      stage: 'wordpress',
      status: 'skipped',
      storyId: story.id,
      detail: 'WordPress is not configured; the approved draft is stored locally for a later run.',
    })
    emitTo(observer, {
      type: 'story:outcome',
      at: nowIso(),
      storyId: story.id,
      outcome: 'retained',
      stage: 'wordpress',
      reason: 'wordpress-not-configured',
    })
    return 'ok'
  }

  if (dryRun) {
    logger.info('DRY RUN — WordPress creation skipped', {
      title: draft.title,
      slug: draft.slug,
      category: draft.category,
      tags: draft.tags,
      words: draft.wordCount,
      confidence: draft.confidence,
    })
    emitTo(observer, {
      type: 'story:wordpress',
      at: nowIso(),
      storyId: story.id,
      result: { status: 'dry-run', slug: draft.slug, reason: 'dry-run: no WordPress request was made' },
    })
    emitTo(observer, {
      type: 'stage',
      at: nowIso(),
      stage: 'wordpress',
      status: 'skipped',
      storyId: story.id,
      detail: 'Dry run — the draft was approved but no WordPress request was made.',
    })
    emitTo(observer, {
      type: 'story:outcome',
      at: nowIso(),
      storyId: story.id,
      outcome: 'dry-run',
      stage: 'wordpress',
    })
    return 'ok'
  }

  /*
   * Run-level draft budget, shared with the pending-publication stage. A run
   * that already spent its post allowance on the backlog keeps this article
   * approved and pending rather than exceeding the cap; the next run picks it up
   * with no LLM cost, exactly like any other deferred publication.
   */
  if (run.counters.draftsCreated >= env.limits.maxDraftsPerRun) {
    logger.info('Draft budget for this run is spent; retaining approved article for the next run', {
      articleId: draft.id,
      draftsCreated: run.counters.draftsCreated,
      maxDraftsPerRun: env.limits.maxDraftsPerRun,
    })
    run.counters.storiesDeferred += 1
    return 'ok'
  }

  const taxonomy = createTaxonomyResolver({
    client: wordpress as WordPressClient,
    logger,
    // Governs TAGS only. Categories are never created while publishing (§20).
    createMissingTags: env.wordpress?.createTerms ?? true,
  })

  const outcome = await publishDraft(draft, {
    client: wordpress as WordPressClient,
    taxonomy,
    repos,
    logger,
    dryRun,
  })

  if (outcome.status === 'created') {
    run.counters.draftsCreated += 1
  } else if (outcome.status === 'deferred') {
    run.counters.storiesDeferred += 1
    logger.info('Publish deferred', { reason: outcome.reason })
  }

  if (observer) {
    const base = (wordpress as WordPressClient).baseUrl
    if (outcome.status === 'created') {
      // The post's own link comes from WordPress; fetched here only so the
      // dashboard's "Open WordPress Draft" button opens the real editor screen.
      let link: string | undefined
      try {
        link = (await (wordpress as WordPressClient).getPost(outcome.wpPostId))?.link
      } catch {
        // Cosmetic only — the editor URL below is derived without it.
      }
      emitTo(observer, {
        type: 'story:wordpress',
        at: nowIso(),
        storyId: story.id,
        result: {
          status: 'created',
          wpPostId: outcome.wpPostId,
          postStatus: 'draft',
          slug: draft.slug,
          baseUrl: base,
          createdAt: nowIso(),
          ...(link ? { link } : {}),
        },
      })
      emitTo(observer, { type: 'stage', at: nowIso(), stage: 'wordpress', status: 'completed', storyId: story.id })
      emitTo(observer, {
        type: 'story:outcome',
        at: nowIso(),
        storyId: story.id,
        outcome: 'published',
        stage: 'wordpress',
      })
    } else {
      emitTo(observer, {
        type: 'story:wordpress',
        at: nowIso(),
        storyId: story.id,
        result: {
          status: outcome.status === 'skipped' ? 'skipped' : 'deferred',
          baseUrl: base,
          ...('reason' in outcome && outcome.reason ? { reason: outcome.reason } : {}),
        },
      })
      emitTo(observer, {
        type: 'stage',
        at: nowIso(),
        stage: 'wordpress',
        status: outcome.status === 'skipped' ? 'skipped' : 'failed',
        storyId: story.id,
        ...('reason' in outcome && outcome.reason ? { detail: outcome.reason } : {}),
      })
      emitTo(observer, {
        type: 'story:outcome',
        at: nowIso(),
        storyId: story.id,
        outcome: 'retained',
        stage: 'wordpress',
        ...('reason' in outcome && outcome.reason ? { reason: outcome.reason } : {}),
      })
    }
  }

  return 'ok'
}
