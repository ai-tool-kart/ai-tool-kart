/*
 * GET /api/usage-stories
 *
 * The "How People Are Using AI" content feed. One endpoint, one shape, no
 * facets: the homepage rail asks for the whole set and renders it, so a filter
 * nobody calls would be a contract to maintain for nothing.
 *
 * This handler depends on the UsageStoryRepository INTERFACE. It does not know
 * the stories are a JSON file, never touches the filesystem, and never imports
 * anything under stories/data/.
 *
 * ── The wire shape is the domain shape ───────────────────────────────────────
 *
 * Unlike a tool — which carries `status`, an internal editorial field the API
 * strips — a story has nothing a client should not see. So there is no
 * projection function here, and adding one later is what should happen if a
 * story ever gains an internal field, rather than the field being exposed
 * because the route had no place to drop it.
 *
 * ── Tools are slugs on the wire, deliberately ────────────────────────────────
 *
 * `toolSlugs` goes out as written. The client already holds the whole catalogue
 * from one cached read and resolves names, monograms and categories from it, so
 * joining here would put a second copy of every tool's name into a second
 * response — a copy that goes stale the moment a tool is renamed. The reference
 * stays a reference all the way to the card.
 */

import { Router } from 'express'
import { z } from 'zod'
import { STORIES_API } from '../../config/limits.ts'
import type { UsageStoryRepository } from '../../stories/repository.ts'
import type { UsageStory } from '../../domain/types.ts'
import { parseOrThrow } from '../validate.ts'

export interface UsageStoryListResponse {
  items: UsageStory[]
  /** Total stories held, which equals `items.length` unless `limit` was sent. */
  total: number
}

/**
 * Query parameters for GET /api/usage-stories.
 *
 * Unknown parameters are rejected rather than ignored, matching /api/tools: a
 * silently dropped `?count=4` presents as "the limit does not work" with
 * nothing anywhere saying why.
 */
const ListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(STORIES_API.maxLimit).optional(),
  })
  .strict()

export interface UsageStoriesRouteOptions {
  stories: UsageStoryRepository
}

export function createUsageStoriesRouter({ stories }: UsageStoriesRouteOptions): Router {
  const router = Router()

  router.get('/', (req, res, next) => {
    void (async () => {
      try {
        const query = parseOrThrow(ListQuerySchema, req.query, 'query')
        const [items, total] = await Promise.all([
          stories.list(query.limit !== undefined ? { limit: query.limit } : {}),
          stories.size(),
        ])
        const body: UsageStoryListResponse = { items, total }
        res.json(body)
      } catch (error) {
        next(error)
      }
    })()
  })

  return router
}
