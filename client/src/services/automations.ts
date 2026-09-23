import { apiRequest } from '@/services/http'
import type { AutomationCard, AutomationDetail, AutomationFilters } from '@/types/automation'

/*
 * The automations transport: GET /api/automations and
 * GET /api/automations/:niche/:slug.
 *
 * Ranking and filtering are the server's. With `q` the API ranks through its
 * matcher; without it, it lists in import order. Either way this module builds
 * a query string and parses a response, and holds no logic of its own.
 *
 * ── What the API accepts (server/src/http/routes/automations.ts) ─────────────
 *
 *   q      string, ≤200 chars         ranked search
 *   niche  one of NICHES              exact; anything else is a 400
 *   kind   'workflow' | 'mcp'         not surfaced in the UI yet
 *   limit  1–50 (default 10)          no cursor — the API does not page
 */

const AUTOMATIONS_PATH = '/automations'

/** The API's ceiling. Asking for more is a 400. */
export const MAX_AUTOMATIONS = 50

/** GET /api/automations — `AutomationListResponse` on the server. */
export interface AutomationListResponse {
  items: AutomationCard[]
  /** How many matched before `limit`: the real count, not the page size. */
  total: number
}

interface AutomationDetailResponse {
  automation: AutomationDetail
}

export interface AutomationQuery extends Partial<AutomationFilters> {
  limit?: number
}

/** Serialises a query; empty values are omitted so a bare visit is a bare request. */
export function automationQueryString(query: AutomationQuery): string {
  const params = new URLSearchParams()
  const q = query.q?.trim()
  if (q) params.set('q', q)
  if (query.niche) params.set('niche', query.niche)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  return params.toString()
}

export async function getAutomations(
  query: AutomationQuery = {},
  signal?: AbortSignal,
): Promise<AutomationListResponse> {
  const search = automationQueryString(query)
  return apiRequest<AutomationListResponse>(`${AUTOMATIONS_PATH}${search ? `?${search}` : ''}`, {
    signal,
  })
}

/**
 * One automation, or `null` when there is none at that niche and slug.
 *
 * A 404 is an answer — the link is wrong or the record was withdrawn — which a
 * page renders as "not found" rather than "something went wrong". A 400 (a
 * niche the API does not know) is the same answer from the reader's side, so it
 * is also `null`. Everything else still throws.
 */
export async function getAutomation(
  niche: string,
  slug: string,
  signal?: AbortSignal,
): Promise<AutomationDetail | null> {
  try {
    const { automation } = await apiRequest<AutomationDetailResponse>(
      `${AUTOMATIONS_PATH}/${encodeURIComponent(niche)}/${encodeURIComponent(slug)}`,
      { signal },
    )
    return automation
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'NOT_FOUND' || error.code === 'INVALID_REQUEST')
    ) {
      return null
    }
    throw error
  }
}
