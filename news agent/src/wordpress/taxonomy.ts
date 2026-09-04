/*
 * Category and tag resolution (NEWS_AGENT.md §20).
 *
 * Terms are resolved by SLUG, once, centrally, and cached for the run. No
 * numeric WordPress id appears anywhere else in the codebase — ids differ per
 * install, so hardcoding one would break the moment the CMS is rebuilt or moved
 * from LocalWP to production.
 *
 * ── The asymmetry this module exists to enforce ──────────────────────────────
 *
 *   CATEGORIES are a controlled editorial taxonomy.
 *     Fixed allowlist (config/editorial.ts). Validated before any request is
 *     made. NEVER created during publishing — an unknown or absent category is a
 *     configuration error that defers the post, because a category invented from
 *     model output is a permanent public taxonomy term nobody chose. Seeding
 *     them is an explicit operator action: see wordpress/bootstrap.ts.
 *
 *   TAGS are an open-ended entity vocabulary.
 *     Validated (editorial/tags.ts), then looked up and created on demand,
 *     because the set of products the industry ships is not knowable in advance.
 *     A tag that cannot be resolved or created is SKIPPED, never fatal.
 *
 * Category failure is fatal, tag failure is not, and that asymmetry is
 * deliberate: every generated post must carry exactly one real category, since
 * the React frontend treats a missing category — and WordPress's default
 * "Uncategorized" — as no category and falls back to the label "Journal"
 * (client/src/components/blog/BlogCategoryPill.tsx). Tags degrade gracefully in
 * the same UI, so losing one costs discoverability, not correctness.
 *
 * ── WordPress capability note (verified against core, WP 6.x) ────────────────
 *
 * The two taxonomies need DIFFERENT privileges to create a term, which is why
 * the split above also happens to be the least-privilege design:
 *
 *   category  is hierarchical  -> REST create requires cap `edit_terms`
 *                                 = edit_categories -> `manage_categories`
 *   post_tag  is flat          -> REST create requires cap `assign_terms`
 *                                 = assign_post_tags -> `edit_posts`
 *
 * (wp-includes/rest-api/endpoints/class-wp-rest-terms-controller.php,
 *  create_item_permissions_check; wp-includes/capabilities.php, map_meta_cap.)
 *
 * So an account with only `edit_posts` — Contributor or Author — can create TAGS
 * but not CATEGORIES. That is exactly the split this module wants: the agent
 * grows the entity vocabulary on its own and can never invent editorial
 * structure.
 */

import { CATEGORY_LABELS, isEditorialCategory, type EditorialCategory } from '../config/editorial.ts'
import { ARTICLE } from '../config/limits.ts'
import { AgentError } from '../domain/errors.ts'
import { checkTag, canonicalTag, tagSlug } from '../editorial/tags.ts'
import type { Logger } from '../utils/logger.ts'
import type { WordPressClient } from './client.ts'

export interface TaxonomyResolver {
  /** Fatal on failure: the post cannot be published without a real category. */
  resolveCategory(category: EditorialCategory): Promise<number>
  /** Never throws. Unresolvable tags are skipped and reported in the result. */
  resolveTags(tags: string[]): Promise<number[]>
}

export interface TaxonomyOptions {
  client: WordPressClient
  logger: Logger
  /**
   * Whether a missing TAG may be created. Categories are never created here
   * regardless of this flag — that is what bootstrap.ts is for.
   */
  createMissingTags: boolean
}

/** Raised when a category is absent or not on the allowlist. Always fatal. */
export function isCategoryConfigurationError(error: unknown): boolean {
  return error instanceof AgentError && error.code === 'WORDPRESS' && error.details?.taxonomyConfig === true
}

export function createTaxonomyResolver({
  client,
  logger,
  createMissingTags,
}: TaxonomyOptions): TaxonomyResolver {
  const log = logger.child({ step: 'taxonomy' })
  // Cached for the run only. A long-lived cache would go stale against a CMS
  // that humans also edit.
  const categoryCache = new Map<string, number>()
  const tagCache = new Map<string, number>()

  return {
    async resolveCategory(category) {
      /*
       * Guard 1: the allowlist. This runs before any network call, so a category
       * that is not configured can never reach WordPress at all — not as a
       * lookup, and certainly not as a creation. §9: model-controlled strings do
       * not become taxonomy terms.
       */
      if (!isEditorialCategory(category)) {
        throw new AgentError(
          'WORDPRESS',
          `Category "${category}" is not in the configured editorial taxonomy. ` +
            `Allowed: ${Object.keys(CATEGORY_LABELS).join(', ')}. ` +
            `Categories are a fixed editorial allowlist and are never created from article output.`,
          { details: { taxonomyConfig: true, category } },
        )
      }

      const cached = categoryCache.get(category)
      if (cached !== undefined) return cached

      // The internal id is already a slug, and it is what the WordPress term is
      // keyed on — so the mapping stays stable even if the display label changes.
      const existing = await client.findTerm('categories', category)
      if (existing) {
        categoryCache.set(category, existing.id)
        return existing.id
      }

      /*
       * Guard 2: absent in WordPress. Deliberately NOT created here. Creating an
       * editorial category as a side effect of publishing one article means the
       * taxonomy grows silently, and it needs a privilege the agent should not
       * hold (manage_categories, which also carries edit/delete on every term in
       * the site). Run `npm run taxonomy:bootstrap` as an operator instead.
       */
      throw new AgentError(
        'WORDPRESS',
        `WordPress category "${category}" (${CATEGORY_LABELS[category]}) does not exist. ` +
          `Categories are seeded explicitly, not created while publishing — ` +
          `run "npm run taxonomy:check" to see what is missing, then ` +
          `"npm run taxonomy:bootstrap" with an account holding manage_categories.`,
        { details: { taxonomyConfig: true, category } },
      )
    },

    async resolveTags(tags) {
      const ids: number[] = []
      const seenSlugs = new Set<string>()

      for (const raw of tags) {
        if (ids.length >= ARTICLE.maxTags) {
          log.warn('Tag cap reached; remaining tags ignored', { max: ARTICLE.maxTags })
          break
        }

        /*
         * Validate before the network call, not after. A malformed or
         * theme-shaped tag must never reach findTerm/createTerm, because
         * createTerm would mint it permanently.
         */
        const checked = checkTag(raw)
        if (!checked.ok) {
          log.warn('Skipping malformed tag from article output', {
            tag: raw.slice(0, 60),
            reason: checked.reason,
          })
          continue
        }

        const name = canonicalTag(checked.tag) ?? checked.tag
        const slug = tagSlug(name)

        // Deduplicate by slug: "OpenAI" and "openai" are one WordPress term.
        if (seenSlugs.has(slug)) continue
        seenSlugs.add(slug)

        const cached = tagCache.get(slug)
        if (cached !== undefined) {
          ids.push(cached)
          continue
        }

        try {
          const existing = await client.findTerm('tags', slug)
          if (existing) {
            tagCache.set(slug, existing.id)
            ids.push(existing.id)
            continue
          }

          if (!createMissingTags) {
            log.info('Tag does not exist and tag creation is disabled; skipping', { tag: name, slug })
            continue
          }

          const created = await client.createTerm('tags', name, slug)
          log.info('Created WordPress tag', { tag: name, slug, termId: created.id })
          tagCache.set(slug, created.id)
          ids.push(created.id)
        } catch (error) {
          /*
           * Non-fatal by design, including a 403. Creating tags needs only
           * `edit_posts`, but a site may restrict it further; if it does, the
           * article still publishes with the tags that did resolve. A tag is not
           * worth losing an article over — a category is.
           */
          const message = error instanceof Error ? error.message : String(error)
          log.warn('Skipping tag that could not be resolved', {
            tag: name,
            slug,
            ...(error instanceof AgentError && error.code === 'WORDPRESS_AUTH'
              ? { note: 'the agent account may lack permission to create tags' }
              : {}),
            err: message,
          })
        }
      }

      if (ids.length < ARTICLE.minTags) {
        log.warn('Post will publish with fewer tags than the editorial target', {
          resolved: ids.length,
          target: ARTICLE.minTags,
        })
      }

      return ids
    },
  }
}
