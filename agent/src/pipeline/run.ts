/*
 * Pipeline orchestration (NEWS_AGENT.md §7).
 *
 * One invocation = one complete run, then the process exits. No daemon, no
 * timers, no long-lived loop.
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
import { writeArticle } from '../generation/write.ts'
import { ingestSources, type IngestDeps } from '../ingestion/ingest.ts'
import { createBudget } from '../llm/budget.ts'
import { createLLMClient } from '../llm/client.ts'
import { createProvider } from '../llm/factory.ts'
import { ClassificationSchema } from '../llm/schemas.ts'
import { CLASSIFIER_SYSTEM, classifierUserPrompt } from '../llm/prompts/index.ts'
import type { MockProviderOptions } from '../llm/providers/mock.ts'
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
}

export interface RunResult {
  run: PipelineRun
  /** Exit code: non-zero only when the run itself failed, not when stories were rejected. */
  exitCode: number
}

export async function executePipeline(options: RunOptions): Promise<RunResult> {
  const { env, repos, logger, dryRun, clock = systemClock } = options
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
    return { run, exitCode: 0 }
  }

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

    const ingested = await ingestSources(sources, {
      env,
      logger: log,
      clock,
      ...(options.ingest?.fetchFeed ? { fetchFeed: options.ingest.fetchFeed } : {}),
    })

    run.counters.sourcesChecked = ingested.sourcesChecked
    run.counters.sourcesFailed = ingested.sourcesFailed
    run.counters.itemsDiscovered = ingested.items.length

    for (const source of sources) {
      // Bookkeeping only; a failure here has already been logged and isolated.
      repos.sources.recordFetch(source.id, true, 'ok')
    }

    /* ── Step 5: dedupe and cluster ──────────────────────────────────────── */
    const clustered = clusterItems(ingested.items, { repos, logger: log, runId: run.id, clock })
    run.counters.itemsDuplicate = clustered.itemsDuplicate + ingested.droppedBeforePersist
    run.counters.storiesCandidate = clustered.stories.length

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

    for (const story of clustered.stories) {
      const items = repos.newsItems.listByIds(story.newsItemIds)
      const storyLog = log.child({ storyId: story.id })

      const prefilter = prefilterStory({ story, items, tierBySourceId, clock })
      if (!prefilter.pass) {
        repos.stories.setStatus(story.id, 'rejected', prefilter.reason)
        run.counters.itemsRejected += items.length
        storyLog.debug('Story rejected by prefilter', { reason: prefilter.reason })
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
        continue
      }

      storyLog.info('Story selected', {
        weighted: Number(scores.weighted.toFixed(2)),
        category,
        recommendation: classification.recommendation,
      })
      scored.push({ story: { ...story, scores, category }, items, category })
    }

    // Highest scoring first, so caps spend the budget on the best material.
    scored.sort((a, b) => b.story.scores.weighted - a.story.scores.weighted)

    const maxArticles = Math.min(options.limit ?? Number.POSITIVE_INFINITY, env.limits.maxArticlesPerRun)

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
        })
        if (outcome === 'publishing-blocked') publishingBlocked = true
      } catch (error) {
        if (isAgentError(error) && error.fatal) throw error

        if (isPublishingBlocked(error)) {
          publishingBlocked = true
          addError('publish', error, { storyId: story.id })
          storyLog.error('WordPress authentication failed; publishing disabled for this run', errorFields(error))
          continue
        }

        addError('story', error, { storyId: story.id })
        repos.stories.setStatus(story.id, 'rejected', `error: ${(error as Error).message}`.slice(0, 300))
        storyLog.warn('Story failed and was isolated', errorFields(error))
      }
    }

    run.llmUsage = { ...budget.usage }
    run.status = 'completed'
    run.finishedAt = nowIso()
  } catch (error) {
    run.llmUsage = { ...budget.usage }
    run.status = 'failed'
    run.finishedAt = nowIso()
    run.note = error instanceof Error ? error.message : String(error)
    addError('run', error)
    log.error('Run failed', errorFields(error))
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
}

async function processStory(deps: ProcessStoryDeps): Promise<'ok' | 'publishing-blocked'> {
  const { story, items, category, env, repos, llm, logger, run, dryRun, wordpress } = deps

  /* Step 9: evidence */
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
  if (!sufficiency.sufficient) {
    repos.stories.setEvidenceState(story.id, 'insufficient')
    const reason =
      gathered.quarantined.length > 0
        ? `${sufficiency.reason} (${gathered.quarantined.length} source(s) quarantined for prompt injection)`
        : sufficiency.reason
    repos.stories.setStatus(story.id, 'rejected', reason)
    logger.info('Story rejected: insufficient evidence', { reason })
    return 'ok'
  }

  for (const evidence of gathered.evidence) repos.evidence.upsert(evidence)
  repos.stories.setEvidenceState(story.id, 'sufficient')

  /* Step 10: claim extraction */
  const extraction = await extractClaims(gathered.evidence, { llm, logger })
  if (extraction.claims.length === 0) {
    repos.stories.setStatus(story.id, 'rejected', 'no-claims-extracted')
    logger.info('Story rejected: no claims extracted')
    return 'ok'
  }

  /* Step 11: verification */
  const verification = await verifyClaims(story.title, extraction.claims, gathered.evidence, {
    llm,
    logger,
  })
  repos.claims.replaceForStory(story.id, verification.claims)

  if (verification.conflicts.length > 0) {
    repos.stories.setEvidenceState(story.id, 'conflicting')
  }

  if (!verification.sufficient) {
    repos.stories.setStatus(story.id, 'rejected', verification.reason)
    logger.info('Story rejected at verification', { reason: verification.reason })
    return 'ok'
  }

  repos.stories.setStatus(story.id, 'verified')
  run.counters.storiesVerified += 1

  /* Steps 12-13: write, review, bounded revision */
  const existing = repos.articles.findByStory(story.id)
  // The article's own row must be excluded from the collision check, or a
  // regenerated story would collide with itself and drift to a "-2" slug.
  const thisArticleId = makeArticleId(story.id)
  let draft = await writeArticle(
    {
      story,
      claims: verification.claims,
      evidence: gathered.evidence,
      category,
      ...(existing?.slug ? { existingSlug: existing.slug } : {}),
    },
    {
      llm,
      logger,
      isSlugTaken: (slug) => repos.articles.slugTaken(slug, thisArticleId),
    },
  )
  run.counters.articlesGenerated += 1

  const publishedTitles = repos.articles.listPublishedTitles(100).map((entry) => entry.title)

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
    draft = await writeArticle(
      {
        story,
        claims: verification.claims,
        evidence: gathered.evidence,
        category,
        revisionNotes: review.writerFixableIssues,
        existingSlug: draft.slug,
        revisionCount: draft.revisionCount + 1,
      },
      { llm, logger, isSlugTaken: (slug) => repos.articles.slugTaken(slug, draft.id) },
    )
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

  if (review.verdict !== 'approved') {
    repos.stories.setStatus(story.id, 'generated', `editorial:${review.verdict}`)
    logger.info('Draft not approved; retained for review', {
      verdict: review.verdict,
      confidence: review.confidence,
      blocking: review.blockingIssues.length,
    })
    return 'ok'
  }

  run.counters.articlesApproved += 1
  repos.stories.setStatus(story.id, 'generated')

  /* Steps 14-16: WordPress draft */
  if (!wordpress && !dryRun) {
    logger.warn('WordPress is not configured; approved draft retained for a later run', {
      articleId: draft.id,
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
    return 'ok'
  }

  const taxonomy = createTaxonomyResolver({
    client: wordpress as WordPressClient,
    logger,
    createMissing: env.wordpress?.createTerms ?? true,
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

  return 'ok'
}
