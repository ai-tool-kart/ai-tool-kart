import { apiRequest } from '@/services/http'
import type { SortOption, Tool, ToolFilters } from '@/types/tool'

/*
 * The catalogue transport: GET /api/tools and GET /api/tools/:slug.
 *
 * Every filter the Browse page offers is applied BY THE SERVER. The API already
 * does query matching, category/tier/stage/tag filtering, sorting and
 * cursor pagination, and it does them against the whole 66-tool catalogue —
 * re-implementing any of that over one fetched page would silently filter a
 * subset and call it a result set. So this module builds a query string and
 * parses a response, and holds no filtering logic of its own.
 *
 * ── What the API accepts (verified against the running server) ───────────────
 *
 *   q          string, ≤200 chars      full-text; drives relevance ranking
 *   cat        ToolCategoryName[]      repeatable OR comma-joined; OR-ed
 *   price      'free'|'freemium'|'paid'[]   NOTE: tier, not the `model` string
 *   stage      WorkflowStage[]         not yet surfaced in the UI
 *   tag        string[]                not yet surfaced in the UI
 *   minRating  0–5                     NOT SENT — see below
 *   sort       relevance|popular|rating|reviews|name
 *   limit      1–50 (default 24)
 *   cursor     opaque, from nextCursor
 *
 * An unknown value is a 400, not an ignored parameter — `cat=Bogus` fails the
 * whole request. Callers must therefore pass values already validated against
 * the taxonomy; utils/browseParams.ts is where a hand-edited URL gets cleaned.
 *
 * `minRating` is deliberately never sent. Every tool in the seeded catalogue has
 * `rating: 0`, so any floor above 0 returns an empty catalogue: the parameter
 * works exactly as designed and is simply unusable until ratings exist.
 */

const TOOLS_PATH = '/tools'

/** The API's own ceiling. Asking for more is a 400. */
export const MAX_PAGE_SIZE = 50
/** What Browse asks for per page. Below the ceiling, above one screenful. */
export const BROWSE_PAGE_SIZE = 24

/** GET /api/tools — `ToolListResponse` on the server. */
export interface ToolListResponse {
  items: Tool[]
  /** Total MATCHING the filters, not the catalogue size. */
  total: number
  /** Absent on the last page. */
  nextCursor?: string
}

/** GET /api/tools/:slug — `ToolResponse` on the server. */
interface ToolDetailResponse {
  tool: Tool
}

export interface ToolQuery extends Partial<ToolFilters> {
  limit?: number
  cursor?: string
}

/**
 * Serialises a query the way the API's schema expects.
 *
 * Arrays go out as repeated keys (`cat=Code&cat=Video`) rather than
 * comma-joined; the server accepts both, and repeated keys survive a category
 * name that ever contains a comma. A default or empty value is omitted
 * entirely, which is what keeps a clean /browse visit a clean request.
 */
export function toolQueryString(query: ToolQuery): string {
  const params = new URLSearchParams()

  const q = query.q?.trim()
  if (q) params.set('q', q)
  for (const cat of query.cat ?? []) params.append('cat', cat)
  for (const price of query.price ?? []) params.append('price', price)
  // `relevance` is the server's default, so sending it says nothing.
  if (query.sort && query.sort !== 'relevance') params.set('sort', query.sort)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.cursor) params.set('cursor', query.cursor)

  return params.toString()
}

/** One page of the catalogue, filtered and sorted by the server. */
export async function getTools(query: ToolQuery = {}, signal?: AbortSignal): Promise<ToolListResponse> {
  const search = toolQueryString(query)
  return apiRequest<ToolListResponse>(`${TOOLS_PATH}${search ? `?${search}` : ''}`, { signal })
}

/**
 * One tool by slug, or `null` when the catalogue has no such tool.
 *
 * A 404 is an answer, not a failure: it means the slug is wrong, which a page
 * renders as "not found" rather than as "something went wrong". Every other
 * status still throws.
 */
export async function getToolBySlug(slug: string, signal?: AbortSignal): Promise<Tool | null> {
  try {
    const { tool } = await apiRequest<ToolDetailResponse>(`${TOOLS_PATH}/${encodeURIComponent(slug)}`, {
      signal,
    })
    return tool
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'NOT_FOUND') return null
    throw error
  }
}

/** The sort the API applies when none is asked for. */
export const DEFAULT_SORT: SortOption = 'relevance'
