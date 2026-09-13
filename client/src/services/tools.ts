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
 *   minRating  0–5                     rating floor; omitted when 0
 *   sort       relevance|popular|rating|reviews|name
 *   limit      1–50 (default 24)
 *   cursor     opaque, from nextCursor
 *
 * An unknown value is a 400, not an ignored parameter — `cat=Bogus` fails the
 * whole request. Callers must therefore pass values already validated against
 * the taxonomy; utils/browseParams.ts is where a hand-edited URL gets cleaned.
 *
 * `minRating` is sent whenever the Refine rail's slider is above 0. Note what a
 * floor does to an UNRATED record: the catalogue uses `rating: 0` to mean "no
 * ratings collected yet", not "rated zero", and four of the 66 seeded tools
 * carry it. Any floor above 0 therefore excludes them. That is the parameter
 * working as specified rather than a bug in either layer, and it is the same
 * distinction the cards make when they render no star row at all for a 0 —
 * never a `0.0 ★`.
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
  // 0 is "no floor", which the API expresses by the parameter's absence.
  if (query.minRating) params.set('minRating', String(query.minRating))
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

/* ─── The slug index ─────────────────────────────────────────────────────────
 *
 * A slug → Tool map of the whole active catalogue, fetched once and shared.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Some surfaces do not filter the catalogue, they REFERENCE it: an editorial AI
 * setup names three or four tools by slug, and the homepage's setup section
 * holds nineteen such setups over about thirty distinct tools. The two obvious
 * ways to resolve that are both wrong. One `GET /api/tools/:slug` per reference
 * is thirty requests for one section. Re-querying on every filter chip is a
 * request per interaction for data that has not changed.
 *
 * So the catalogue is read once — 66 records over two pages, about 46KB per page
 * uncompressed — and every reference is answered from memory afterwards. Chip
 * filtering then costs nothing, and a second consumer (the Workflows screen, a
 * setup detail view) shares the same fetch.
 *
 * ── What it is not ───────────────────────────────────────────────────────────
 *
 * It is NOT a client-side substitute for the API's filtering. Browse still asks
 * the server every question it asks, because the server paginates and ranks and
 * this map would only ever be a stale copy of the first N records. This is a
 * lookup table for known keys, which is the one job a full read is honestly good
 * at.
 *
 * ── The size it stops being right at ─────────────────────────────────────────
 *
 * This reads the whole catalogue, so it scales with the catalogue and not with
 * what is on screen. At 66 tools that is the cheaper trade by a wide margin; at
 * a few hundred it stops being. The upgrade is a slug filter on the endpoint
 * that already exists — `GET /api/tools?slug=claude&slug=cursor`, alongside the
 * repeatable `cat` and `tag` it already accepts — at which point this function
 * fetches only the slugs asked for and every caller stays as it is. That is a
 * server change, so it is not made here.
 *
 * Like services/taxonomy.ts, the promise is shared and therefore takes no
 * AbortSignal: one component unmounting must not cancel the read the others are
 * waiting on. A rejection clears the slot so a later mount retries.
 */

/** Guards the paging loop against a server that never stops returning cursors. */
const MAX_INDEX_PAGES = 20

export type ToolIndex = ReadonlyMap<string, Tool>

let indexInFlight: Promise<ToolIndex> | undefined

export async function getToolIndex(): Promise<ToolIndex> {
  if (!indexInFlight) {
    indexInFlight = loadIndex().catch((error: unknown) => {
      indexInFlight = undefined
      throw error
    })
  }
  return indexInFlight
}

async function loadIndex(): Promise<ToolIndex> {
  const index = new Map<string, Tool>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_INDEX_PAGES; page += 1) {
    // `sort: 'name'` rather than the default: relevance with no query is the
    // repository's popularity order, which is fine but arbitrary here, and a
    // stable, obviously-total ordering makes a partial read easy to reason about.
    const response = await getTools({ sort: 'name', limit: MAX_PAGE_SIZE, cursor })
    for (const tool of response.items) index.set(tool.slug, tool)
    cursor = response.nextCursor
    if (!cursor) break
  }

  return index
}
