/*
 * GET /api/tools, GET /api/tools/:slug and GET /api/taxonomy.
 *
 * The catalogue's public surface, and what lets Phase G retire
 * client/src/data/tools.ts (ASSISTANT_ARCHITECTURE_PLAN.md §13).
 *
 * These handlers depend on the RetrievalService and the ToolCatalogueRepository
 * INTERFACE. They do not know the catalogue is a JSON file, never touch the
 * filesystem, and never import anything under catalogue/data/.
 *
 * ── Why a text query is routed through retrieval ──────────────────────────────
 *
 * The repository's own `q` is deliberately thin: substring matching over name,
 * tagline, summary and tags — the honest analogue of a SQL ILIKE, and all a
 * storage layer should promise. It would answer "edit videos faster" with every
 * record containing the word "video", in popularity order.
 *
 * The ranking that puts Descript and Opus Clip at the top is a PRODUCT decision
 * living in retrieval/, so `?q=` is answered there. Faceted browsing with no
 * text goes straight to the repository, where sorting and cursors belong.
 * Both paths return the same shape, so the client cannot tell which ran.
 */

import { Router } from 'express'
import { z } from 'zod'
import { TOOLS_API } from '../../config/limits.ts'
import type { ToolCatalogueRepository } from '../../catalogue/repository.ts'
import {
  PRICING_TIERS,
  SORT_OPTIONS,
  TOOL_CATEGORIES,
  WORKFLOW_STAGES,
} from '../../catalogue/taxonomy.ts'
import { notFound } from '../../domain/errors.ts'
import type { Tool } from '../../domain/types.ts'
import type { RetrievalService } from '../../retrieval/service.ts'
import { parseOrThrow, toStringList } from '../validate.ts'

/**
 * The wire representation of a tool.
 *
 * Everything except `status`, which is an editorial workflow field: a client has
 * no use for it, and every record it could ever see is 'active' anyway. Omitting
 * it keeps the contract honest rather than shipping a field that is a constant.
 */
export type ApiTool = Omit<Tool, 'status'>

export interface ToolListResponse {
  items: ApiTool[]
  total: number
  nextCursor?: string
}

export interface ToolResponse {
  tool: ApiTool
}

function toApiTool(tool: Tool): ApiTool {
  const { status: _status, ...rest } = tool
  return rest
}

/**
 * Query parameters for GET /api/tools.
 *
 * Unknown parameters are rejected rather than ignored. A silently dropped
 * `?category=Video` (the client meant `cat`) presents as "the filter does not
 * work" with nothing anywhere saying why.
 */
const ListQuerySchema = z
  .object({
    q: z.string().trim().max(TOOLS_API.maxQueryLength).optional(),
    cat: z.preprocess(toStringList, z.array(z.enum(TOOL_CATEGORIES)).optional()),
    price: z.preprocess(toStringList, z.array(z.enum(PRICING_TIERS)).optional()),
    stage: z.preprocess(toStringList, z.array(z.enum(WORKFLOW_STAGES)).optional()),
    tag: z.preprocess(toStringList, z.array(z.string().min(1)).optional()),
    minRating: z.coerce.number().min(0).max(5).optional(),
    sort: z.enum(SORT_OPTIONS).optional(),
    limit: z.coerce.number().int().min(1).max(TOOLS_API.maxLimit).optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict()

const SlugParamsSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase hyphenated slug')
      .max(64),
  })
  .strict()

export interface ToolsRouteOptions {
  catalogue: ToolCatalogueRepository
  retrieval: RetrievalService
}

export function createToolsRouter({ catalogue, retrieval }: ToolsRouteOptions): Router {
  const router = Router()

  router.get('/', (req, res, next) => {
    void (async () => {
      try {
        const query = parseOrThrow(ListQuerySchema, req.query, 'query')
        const limit = query.limit ?? TOOLS_API.defaultLimit

        /*
         * A text query is ranked by retrieval, except when the caller asked for
         * an explicit non-relevance sort — "search for video tools, ordered
         * A–Z" is a browse operation with a keyword, and the repository already
         * does exactly that.
         */
        const useRetrieval =
          query.q !== undefined && query.q.length > 0 && (query.sort ?? 'relevance') === 'relevance'

        if (useRetrieval) {
          const ranked = await retrieval.rank({
            query: query.q as string,
            filters: {
              ...(query.cat ? { categories: query.cat } : {}),
              ...(query.price ? { pricingTiers: query.price } : {}),
              ...(query.minRating !== undefined ? { minRating: query.minRating } : {}),
            },
          })

          // Stage and tag are repository facets rather than scoring inputs, so
          // they are applied to the ranked list to keep one filter vocabulary.
          const filtered = ranked.filter((tool) => {
            if (query.stage && !query.stage.some((stage) => tool.stages.includes(stage))) {
              return false
            }
            if (query.tag) {
              const wanted = query.tag.map((tag) => tag.toLowerCase())
              if (!tool.tags.some((tag) => wanted.includes(tag.toLowerCase()))) return false
            }
            return true
          })

          const offset = decodeOffset(query.cursor)
          const items = filtered.slice(offset, offset + limit)
          const body: ToolListResponse = {
            items: items.map(toApiTool),
            total: filtered.length,
          }
          if (offset + items.length < filtered.length) {
            body.nextCursor = encodeOffset(offset + items.length)
          }
          res.json(body)
          return
        }

        const page = await catalogue.search({
          ...(query.q ? { q: query.q } : {}),
          ...(query.cat ? { categories: query.cat } : {}),
          ...(query.price ? { pricingTiers: query.price } : {}),
          ...(query.stage ? { stages: query.stage } : {}),
          ...(query.tag ? { tags: query.tag } : {}),
          ...(query.minRating !== undefined ? { minRating: query.minRating } : {}),
          ...(query.sort ? { sort: query.sort } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
          limit,
        })

        const body: ToolListResponse = {
          items: page.items.map(toApiTool),
          total: page.total,
        }
        if (page.nextCursor) body.nextCursor = page.nextCursor
        res.json(body)
      } catch (error) {
        next(error)
      }
    })()
  })

  router.get('/:slug', (req, res, next) => {
    void (async () => {
      try {
        const { slug } = parseOrThrow(SlugParamsSchema, req.params, 'params')
        const tool = await catalogue.findBySlug(slug)
        if (!tool || tool.status !== 'active') {
          // A draft record is reported as missing, not as forbidden: whether an
          // unpublished tool exists is not something a public client is owed.
          throw notFound(`No tool matches the slug "${slug}".`, { slug })
        }
        const body: ToolResponse = { tool: toApiTool(tool) }
        res.json(body)
      } catch (error) {
        next(error)
      }
    })()
  })

  return router
}

export function createTaxonomyRouter({ retrieval }: { retrieval: RetrievalService }): Router {
  const router = Router()

  router.get('/', (_req, res, next) => {
    void (async () => {
      try {
        res.json(await retrieval.taxonomy())
      } catch (error) {
        next(error)
      }
    })()
  })

  return router
}

/*
 * The retrieval path's cursor.
 *
 * Deliberately the same opaque base64 offset the JSON adapter emits, so a client
 * never has to know which path answered it. Both are opaque, so replacing either
 * with a keyset cursor is a change to one file.
 */
function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url')
}

function decodeOffset(cursor: string | undefined): number {
  if (!cursor) return 0
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (parsed && typeof parsed === 'object' && 'o' in parsed) {
      const offset = (parsed as { o: unknown }).o
      if (typeof offset === 'number' && Number.isInteger(offset) && offset >= 0) return offset
    }
  } catch {
    /* a stale or forged cursor restarts from the beginning rather than throwing */
  }
  return 0
}
