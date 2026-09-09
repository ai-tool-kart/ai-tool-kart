import { useMemo } from 'react'
import { useToolIndex } from '@/hooks/useToolIndex'
import type { Tool } from '@/types/tool'
import { sortByRecency } from '@/utils/recency'

/*
 * The most recently added tools in the catalogue.
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   useRecentlyAddedTools
 *     └─ useToolIndex ─ services/tools.ts ─ GET /api/tools (paged, cached once)
 *
 * The SAME shared read that Featured AI Tools and AI for Your Work already
 * wait on, so adding this section to the homepage costs no additional request.
 * There is no second fetch path and no second cache: `getToolIndex()` holds one
 * module-level promise for the whole catalogue.
 *
 * ── Why not GET /api/tools?sort=newest&limit=8 ───────────────────────────────
 *
 * That endpoint exists and returns exactly this list — the `newest` sort was
 * added to the server in the same pass, because Browse needs it for
 * /browse?sort=newest and because the ordering rule belongs in the catalogue.
 * The homepage does not use it: by the time this section renders, all 66
 * records are already in memory beside it, and asking the network for eight of
 * them again would be a round trip to re-derive something the page holds.
 *
 * At 66 tools that trade is not close. It stops being right when the client
 * stops reading the catalogue whole — at which point this hook calls
 * `getTools({ sort: 'newest', limit })` and nothing above it changes, because
 * the ordering it would get back is the one utils/recency.ts already applies.
 */

export interface RecentlyAddedTools {
  /** Newest first. Empty while loading, and after a read that failed. */
  tools: Tool[]
  isLoading: boolean
  /** True once the catalogue read has failed. The section hides itself. */
  failed: boolean
}

export function useRecentlyAddedTools(count: number): RecentlyAddedTools {
  const { index, isLoading, failed } = useToolIndex()

  /*
   * `index` is a stable reference for the life of the page, so this sorts once
   * rather than on every render of the homepage. Tools with no intake date are
   * dropped by `sortByRecency` — see the note there on why they are excluded
   * here but kept in a full `sort=newest` listing.
   */
  const tools = useMemo(
    () => (index ? sortByRecency(index.values()).slice(0, count) : []),
    [index, count],
  )

  return { tools, isLoading, failed }
}
