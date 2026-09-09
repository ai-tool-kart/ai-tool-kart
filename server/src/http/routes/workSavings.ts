/*
 * GET /api/work-savings
 *
 * The role estimates behind "See What AI Can Save You". One endpoint, one shape,
 * no facets: the section fetches the whole set once and switches between
 * estimates locally, so there is nothing to filter and no page to turn.
 *
 * This handler depends on the WorkSavingsRepository INTERFACE. It does not know
 * the estimates are a JSON file, never touches the filesystem, and never imports
 * anything under savings/data/.
 *
 * ── The wire shape is the domain shape ───────────────────────────────────────
 *
 * Nothing on an estimate is internal, so there is no projection. Adding one is
 * what should happen if an estimate ever gains an editorial workflow field,
 * rather than the field being exposed because the route had no place to drop it.
 *
 * ── The left-hand table is NOT served from here ──────────────────────────────
 *
 * The section's general Time/Cost/Effort comparison is static editorial content
 * on the client (data/savings.ts). Deliberately: it is the part of the section
 * that must still render when this endpoint is unreachable, and content that has
 * to survive an outage should not be behind the thing that goes out.
 */

import { Router } from 'express'
import { z } from 'zod'
import { SAVINGS_API } from '../../config/limits.ts'
import type { WorkSavingsRepository } from '../../savings/repository.ts'
import type { WorkSavingsEstimate } from '../../domain/types.ts'
import { parseOrThrow } from '../validate.ts'

export interface WorkSavingsListResponse {
  items: WorkSavingsEstimate[]
  /** Total held, which equals `items.length` unless `limit` was sent. */
  total: number
}

/**
 * Query parameters for GET /api/work-savings.
 *
 * Unknown parameters are rejected rather than ignored, matching every other
 * route: a silently dropped `?role=Developer` presents as "the filter does not
 * work" with nothing anywhere saying why.
 */
const ListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(SAVINGS_API.maxLimit).optional(),
  })
  .strict()

export interface WorkSavingsRouteOptions {
  savings: WorkSavingsRepository
}

export function createWorkSavingsRouter({ savings }: WorkSavingsRouteOptions): Router {
  const router = Router()

  router.get('/', (req, res, next) => {
    void (async () => {
      try {
        const query = parseOrThrow(ListQuerySchema, req.query, 'query')
        const [items, total] = await Promise.all([
          savings.list(query.limit !== undefined ? { limit: query.limit } : {}),
          savings.size(),
        ])
        const body: WorkSavingsListResponse = { items, total }
        res.json(body)
      } catch (error) {
        next(error)
      }
    })()
  })

  return router
}
