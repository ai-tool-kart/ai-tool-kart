/*
 * Draft publishing and idempotency (NEWS_AGENT.md §17, §18; §36 of the brief).
 *
 * The one rule that matters: running the pipeline twice must never produce two
 * WordPress drafts for one story. Three guards enforce it, in order:
 *
 *   1. before the request  — the article row already carries a wp_post_id
 *   2. before the request  — the story was merged into another story that has one
 *   3. after  the request  — the id is persisted immediately, and the repository
 *                            refuses to overwrite an existing one
 *
 * RESIDUAL RACE, stated rather than hidden: WordPress's REST API offers no
 * idempotency key, so a crash in the window between "WordPress created the post"
 * and "we stored its id" leaves an orphaned draft that the next run cannot see.
 * The window is one synchronous database write wide. It is narrowed further by
 * the slug: WordPress derives a unique slug per post, so an orphan surfaces as a
 * "-2" suffixed duplicate in the editor rather than as a published duplicate,
 * and the draft-only policy means no reader ever sees either. Closing it fully
 * would need a pre-flight slug lookup on every publish; that trade is revisited
 * if orphans are ever observed.
 */

import type { ArticleDraft } from '../domain/types.ts'
import { AgentError, isAgentError } from '../domain/errors.ts'
import type { Repositories } from '../storage/repositories.ts'
import type { Logger } from '../utils/logger.ts'
import type { EditorialCategory } from '../config/editorial.ts'
import type { CreatePostPayload, WordPressClient } from './client.ts'
import { isCategoryConfigurationError, type TaxonomyResolver } from './taxonomy.ts'

export interface PublishDeps {
  client: WordPressClient
  taxonomy: TaxonomyResolver
  repos: Repositories
  logger: Logger
  dryRun: boolean
}

export type PublishOutcome =
  | { status: 'created'; wpPostId: number }
  | { status: 'skipped'; reason: string }
  | { status: 'dry-run' }
  | { status: 'deferred'; reason: string }

/**
 * Builds the WordPress payload.
 *
 * `status` is hardcoded, not derived from configuration. There is no code path
 * in this MVP that can publish, which is the guarantee §18 asks for — the
 * AGENT_AUTO_PUBLISH env var is validated to be false at startup and is never
 * consulted here.
 */
export function buildPostPayload(
  draft: ArticleDraft,
  categoryId: number,
  tagIds: number[],
): CreatePostPayload {
  return {
    title: draft.title,
    slug: draft.slug,
    content: draft.content,
    // Explicit, never auto-generated: WordPress would otherwise truncate the
    // body mid-sentence, and the React cards render this field directly.
    excerpt: draft.excerpt,
    status: 'draft',
    categories: [categoryId],
    tags: tagIds,
  }
}

export async function publishDraft(
  draft: ArticleDraft,
  deps: PublishDeps,
): Promise<PublishOutcome> {
  const { client, taxonomy, repos, logger, dryRun } = deps
  const log = logger.child({ step: 'publish', storyId: draft.storyId, articleId: draft.id })

  if (draft.editorialStatus !== 'approved') {
    return { status: 'skipped', reason: `not-approved (${draft.editorialStatus})` }
  }

  // Guard 1: this article already has a post.
  const persisted = repos.articles.findByStory(draft.storyId)
  if (persisted?.wpPostId) {
    log.info('Story already has a WordPress draft; skipping', { wpPostId: persisted.wpPostId })
    return { status: 'skipped', reason: `already-published (wp:${persisted.wpPostId})` }
  }

  // Guard 2: the story was merged into another that already has a post.
  const story = repos.stories.get(draft.storyId)
  if (story?.duplicateOfStoryId) {
    const canonical = repos.articles.findByStory(story.duplicateOfStoryId)
    if (canonical?.wpPostId) {
      log.warn('Story is a duplicate of one already published; aborting publish', {
        duplicateOf: story.duplicateOfStoryId,
        wpPostId: canonical.wpPostId,
      })
      return { status: 'skipped', reason: 'duplicate-of-published-story' }
    }
  }

  if (dryRun) {
    log.info('DRY RUN — WordPress creation skipped', {
      title: draft.title,
      slug: draft.slug,
      category: draft.category,
      tags: draft.tags,
      words: draft.wordCount,
    })
    return { status: 'dry-run' }
  }

  let categoryId: number
  let tagIds: number[]
  try {
    categoryId = await taxonomy.resolveCategory(draft.category as EditorialCategory)
    tagIds = await taxonomy.resolveTags(draft.tags)
  } catch (error) {
    if (isAgentError(error) && error.code === 'WORDPRESS_AUTH') throw error
    /*
     * A missing or unconfigured category defers this article and says so
     * precisely. It is an editorial/configuration problem an operator fixes with
     * `npm run taxonomy:check` — never something to paper over by inventing the
     * term, which is why taxonomy.ts refuses to create one (§20).
     */
    if (isCategoryConfigurationError(error)) {
      log.error('Category is not configured or does not exist in WordPress; deferring publish', {
        category: draft.category,
        err: error instanceof Error ? error.message : String(error),
      })
      return { status: 'deferred', reason: 'category-not-configured' }
    }
    log.warn('Taxonomy resolution failed; deferring publish', {
      err: error instanceof Error ? error.message : String(error),
    })
    return { status: 'deferred', reason: 'taxonomy-resolution-failed' }
  }

  const payload = buildPostPayload(draft, categoryId, tagIds)

  let post
  try {
    post = await client.createPost(payload)
  } catch (error) {
    // Auth failures propagate: they stop publishing for the whole run (§25).
    if (isAgentError(error) && error.code === 'WORDPRESS_AUTH') throw error
    /*
     * Anything else defers. The approved draft stays persisted and is retried on
     * a later run — §24 is explicit that WordPress being unavailable must not
     * cost the generated article.
     */
    log.warn('WordPress post creation failed; draft retained for retry', {
      err: error instanceof Error ? error.message : String(error),
    })
    return { status: 'deferred', reason: 'wordpress-unavailable' }
  }

  /*
   * Persist the id immediately, before anything else can fail. This write is
   * what makes the next run idempotent, so it happens before the story status
   * update and before the run is finalised (§17).
   */
  try {
    repos.articles.recordWordPressPost(draft.id, post.id)
  } catch (error) {
    // The post exists in WordPress but we could not record it. Loud, because it
    // is the one state that can produce a duplicate on the next run.
    log.error('CRITICAL: WordPress draft created but its id could not be persisted', {
      wpPostId: post.id,
      slug: post.slug,
      err: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  if (post.status !== 'draft') {
    // Should be impossible; WordPress honours the status we send. Surfaced
    // rather than ignored because publishing is exactly what must not happen.
    log.error('WordPress returned a non-draft status for an agent post', {
      wpPostId: post.id,
      status: post.status,
    })
  }

  repos.stories.setStatus(draft.storyId, 'published')

  log.info('WordPress draft created', {
    wpPostId: post.id,
    slug: post.slug,
    category: draft.category,
    tags: draft.tags.length,
  })

  return { status: 'created', wpPostId: post.id }
}

/** True when the error should stop all publishing for this run. */
export function isPublishingBlocked(error: unknown): boolean {
  return error instanceof AgentError && error.code === 'WORDPRESS_AUTH'
}
