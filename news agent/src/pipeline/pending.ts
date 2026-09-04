/*
 * Pending-publication retry stage (NEWS_AGENT.md §24, §25).
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 *
 * An article can reach `editorial_status = 'approved'` and be persisted, and
 * still fail the WordPress call — the CMS is down, the taxonomy lookup times
 * out, nginx is misconfigured. §24 is explicit that the approved draft must then
 * be kept and retried on a later run, never regenerated.
 *
 * Nothing was retrying it. On the next run the story's news items are already in
 * `news_items`, so dedupe classifies every one of them as seen and the story
 * never re-enters generation. The approved article sat with `wp_post_id = NULL`
 * forever: work that was fully paid for, one HTTP request short of done.
 *
 * ── Why this runs before ingestion ───────────────────────────────────────────
 *
 * The run lock is held, so this stage has the pipeline to itself. Then:
 *
 *   1. A pending article is finished editorial work. Evidence gathering,
 *      verification, writing and editing all happened in an earlier run and are
 *      not repeated here — the retry costs one HTTP request and zero LLM budget.
 *      Draining the queue first means an ingestion failure, a run where every
 *      feed is stale, or an exhausted LLM budget can never starve it.
 *   2. A WordPress auth failure is an operator problem (§25: 401/403, no retry,
 *      stop publishing). Discovering it here disables publishing for the run
 *      before the LLM budget is spent generating articles that could not be
 *      posted anyway.
 *   3. It is deliberately independent of ingestion. The retry is driven by
 *      persisted article state, not by a news item becoming "new" again — which
 *      is precisely the condition that can never recur.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 *
 * No guard is relaxed. The queue itself excludes anything with a `wp_post_id`;
 * each candidate is re-read from the database immediately before its attempt so
 * a stale in-memory row cannot drive a second post; and publishDraft() then
 * re-applies its own three guards, including the repository's refusal to
 * overwrite an existing post id. The residual crash window documented at the top
 * of wordpress/publish.ts is unchanged — this stage adds no new one, because it
 * reuses that same publish path rather than its own.
 */

import type { AgentEnv } from '../config/env.ts'
import type { PipelineRun, RunError } from '../domain/types.ts'
import { PENDING_PUBLISH } from '../config/limits.ts'
import type { Repositories } from '../storage/repositories.ts'
import { errorFields, type Logger } from '../utils/logger.ts'
import type { WordPressClient } from '../wordpress/client.ts'
import { isPublishingBlocked, publishDraft } from '../wordpress/publish.ts'
import { createTaxonomyResolver } from '../wordpress/taxonomy.ts'

export interface RetryPendingDeps {
  env: AgentEnv
  repos: Repositories
  logger: Logger
  run: PipelineRun
  dryRun: boolean
  /** Absent when WordPress is unconfigured or the run is a dry run. */
  wordpress?: WordPressClient
  /** Records a run-level error, shared with the main pipeline's collector. */
  addError: (step: string, error: unknown, extra?: Partial<RunError>) => void
}

export interface RetryPendingResult {
  /** Rows in the queue at the start of the stage. */
  pending: number
  /** Publication attempts actually made. */
  attempted: number
  created: number
  /** Attempts that were declined by a guard before any request was sent. */
  skipped: number
  /** True when WordPress authentication failed: publishing is off for the run. */
  publishingBlocked: boolean
}

const EMPTY: RetryPendingResult = {
  pending: 0,
  attempted: 0,
  created: 0,
  skipped: 0,
  publishingBlocked: false,
}

/**
 * Retries WordPress publication for articles approved by an earlier run.
 *
 * Never calls the Writer, the Editor, or any other LLM task: the persisted
 * article is the work item, and regenerating it is exactly what §24 forbids.
 * An article that fails again is left approved with `wp_post_id = NULL`, so the
 * next run finds it in the same queue.
 */
export async function retryPendingPublications(
  deps: RetryPendingDeps,
): Promise<RetryPendingResult> {
  const { env, repos, run, dryRun, wordpress, addError } = deps
  const log = deps.logger.child({ step: 'publish-retry' })

  const queue = repos.articles.listAwaitingPublication(PENDING_PUBLISH.maxPerRun)
  if (queue.length === 0) {
    log.debug('No approved drafts awaiting publication')
    return EMPTY
  }

  const result: RetryPendingResult = { ...EMPTY, pending: queue.length }

  /*
   * A dry run must not touch the CMS, and an unconfigured WordPress has nothing
   * to retry against. Both are reported rather than silent: a growing pending
   * count with no live target is what an operator needs to see.
   */
  if (dryRun) {
    log.info('DRY RUN — approved drafts awaiting publication were not retried', {
      pending: queue.length,
      slugs: queue.slice(0, 5).map((article) => article.slug),
    })
    return result
  }

  if (!wordpress) {
    log.warn('WordPress is not configured; approved drafts remain pending', {
      pending: queue.length,
    })
    return result
  }

  log.info('Retrying approved drafts left unpublished by an earlier run', {
    pending: queue.length,
  })

  const taxonomy = createTaxonomyResolver({
    client: wordpress,
    logger: log,
    // Governs TAGS only. Categories are never created while publishing (§20).
    createMissingTags: env.wordpress?.createTerms ?? true,
  })

  let consecutiveFailures = 0

  for (const queued of queue) {
    /*
     * Re-read immediately before the attempt. The queue was materialised at the
     * top of the stage; this is what guarantees the row driving a POST reflects
     * current state rather than a snapshot.
     */
    const article = repos.articles.findByStory(queued.storyId)
    if (!article) {
      result.skipped += 1
      log.warn('Pending article vanished between queue and retry; skipping', {
        articleId: queued.id,
      })
      continue
    }
    if (article.wpPostId) {
      result.skipped += 1
      log.info('Pending article already has a WordPress post; skipping', {
        articleId: article.id,
        wpPostId: article.wpPostId,
      })
      continue
    }
    if (article.editorialStatus !== 'approved') {
      result.skipped += 1
      log.info('Pending article is no longer approved; skipping', {
        articleId: article.id,
        editorialStatus: article.editorialStatus,
      })
      continue
    }

    result.attempted += 1

    try {
      const outcome = await publishDraft(article, {
        client: wordpress,
        taxonomy,
        repos,
        logger: log,
        dryRun: false,
      })

      if (outcome.status === 'created') {
        consecutiveFailures = 0
        result.created += 1
        run.counters.draftsCreated += 1
        log.info('Pending draft published on retry', {
          articleId: article.id,
          wpPostId: outcome.wpPostId,
        })
        continue
      }

      if (outcome.status === 'skipped') {
        consecutiveFailures = 0
        result.skipped += 1
        log.info('Pending draft skipped by a publication guard', {
          articleId: article.id,
          reason: outcome.reason,
        })
        continue
      }

      // Deferred: the article stays approved with wp_post_id NULL and is picked
      // up by the same query on the next run.
      consecutiveFailures += 1
      run.counters.storiesDeferred += 1
      log.warn('Pending draft still could not be published; left for a later run', {
        articleId: article.id,
        reason: outcome.status === 'deferred' ? outcome.reason : outcome.status,
      })
    } catch (error) {
      if (isPublishingBlocked(error)) {
        result.publishingBlocked = true
        addError('publish-retry', error, { storyId: article.storyId })
        log.error(
          'WordPress authentication failed while retrying a pending draft; ' +
            'publishing is disabled for this run and the draft stays pending',
          errorFields(error),
        )
        return result
      }

      /*
       * Anything else is isolated to this article, exactly as a story failure is
       * in the main loop. The row is untouched, so it remains in the queue.
       */
      consecutiveFailures += 1
      addError('publish-retry', error, { storyId: article.storyId })
      log.warn('Pending draft retry failed; draft retained', {
        articleId: article.id,
        ...errorFields(error),
      })
    }

    if (consecutiveFailures >= PENDING_PUBLISH.maxConsecutiveFailures) {
      log.warn('Stopping the retry batch: WordPress is failing repeatedly', {
        consecutiveFailures,
        remainingPending: queue.length - result.attempted - result.skipped,
      })
      break
    }
  }

  log.info('Publication retry stage finished', {
    pending: result.pending,
    attempted: result.attempted,
    created: result.created,
    skipped: result.skipped,
  })

  return result
}
