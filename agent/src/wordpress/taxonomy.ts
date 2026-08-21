/*
 * Category and tag resolution (NEWS_AGENT.md §20).
 *
 * Terms are resolved by SLUG, once, centrally, and cached for the run. No
 * numeric WordPress id appears anywhere else in the codebase — ids differ per
 * install, so hardcoding one would break the moment the CMS is rebuilt or moved
 * from LocalWP to production.
 *
 * Every agent post gets exactly one real category. The React frontend treats a
 * missing category, and WordPress's default "Uncategorized", as no category and
 * falls back to the label "Journal"
 * (client/src/components/blog/BlogCategoryPill.tsx), so publishing without one
 * silently degrades the card design.
 */

import { CATEGORY_LABELS, type EditorialCategory } from '../config/editorial.ts'
import { AgentError } from '../domain/errors.ts'
import type { Logger } from '../utils/logger.ts'
import { slugify } from '../generation/slug.ts'
import type { WordPressClient } from './client.ts'

export interface TaxonomyResolver {
  resolveCategory(category: EditorialCategory): Promise<number>
  resolveTags(tags: string[]): Promise<number[]>
}

export interface TaxonomyOptions {
  client: WordPressClient
  logger: Logger
  /** When false, a missing term is an error rather than something to create. */
  createMissing: boolean
}

export function createTaxonomyResolver({
  client,
  logger,
  createMissing,
}: TaxonomyOptions): TaxonomyResolver {
  const log = logger.child({ step: 'taxonomy' })
  // Cached for the run only. A long-lived cache would go stale against a CMS
  // that humans also edit.
  const categoryCache = new Map<string, number>()
  const tagCache = new Map<string, number>()

  async function resolveTerm(
    taxonomy: 'categories' | 'tags',
    name: string,
    slug: string,
    cache: Map<string, number>,
  ): Promise<number> {
    const cached = cache.get(slug)
    if (cached !== undefined) return cached

    const existing = await client.findTerm(taxonomy, slug)
    if (existing) {
      cache.set(slug, existing.id)
      return existing.id
    }

    if (!createMissing) {
      throw new AgentError(
        'WORDPRESS',
        `WordPress ${taxonomy} term "${slug}" does not exist and WORDPRESS_CREATE_TERMS is false. ` +
          `Create it in WordPress, or enable term creation.`,
        { details: { taxonomy, slug } },
      )
    }

    const created = await client.createTerm(taxonomy, name, slug)
    log.info('Created WordPress term', { taxonomy, slug, termId: created.id })
    cache.set(slug, created.id)
    return created.id
  }

  return {
    async resolveCategory(category) {
      const label = CATEGORY_LABELS[category]
      if (!label) {
        throw new AgentError('WORDPRESS', `Unknown editorial category "${category}"`)
      }
      // The internal id is already a slug, and it is what the WordPress term is
      // keyed on — so the mapping stays stable even if the display label changes.
      return resolveTerm('categories', label, category, categoryCache)
    },

    async resolveTags(tags) {
      const ids: number[] = []
      for (const tag of tags) {
        const name = tag.trim()
        if (!name) continue
        try {
          ids.push(await resolveTerm('tags', name, slugify(name), tagCache))
        } catch (error) {
          /*
           * A tag is not worth losing an article over. Categories are, because
           * the frontend's design depends on one being present; tags degrade
           * gracefully.
           */
          log.warn('Skipping tag that could not be resolved', {
            tag: name,
            err: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return ids
    },
  }
}
