import { apiRequest } from '@/services/http'
import type { UsageStory } from '@/types/usageStory'

/*
 * GET /api/usage-stories.
 *
 * One request, cached for the life of the page — the same shape as
 * services/taxonomy.ts, and for the same reason. These are editorial records
 * that change when the server is redeployed, never between two renders, and the
 * homepage mounts exactly one consumer. The cache is what keeps a remount from
 * re-fetching a constant.
 *
 * ── Why this takes no AbortSignal ────────────────────────────────────────────
 *
 * The promise is SHARED. Wiring a caller's signal into it would let whichever
 * component unmounted first abort a request another was still waiting on. So the
 * fetch is deliberately uncancellable — it is a couple of kilobytes — and
 * cancellation is handled in the hook, which ignores a result arriving after
 * unmount.
 *
 * A rejection clears the slot so a later mount retries rather than replaying the
 * same failure forever.
 *
 * ── No tool data comes back through here ─────────────────────────────────────
 *
 * The response carries `toolSlugs`, never tool objects. Resolution happens
 * against the catalogue index the page has already read (services/tools.ts), so
 * this endpoint and the catalogue endpoint are one request each and neither
 * restates the other.
 */

const STORIES_PATH = '/usage-stories'

/** GET /api/usage-stories — `UsageStoryListResponse` on the server. */
interface UsageStoryListResponse {
  items: UsageStory[]
  /** Total held, which equals `items.length` unless a limit was sent. */
  total: number
}

let inFlight: Promise<UsageStory[]> | undefined

export async function getUsageStories(): Promise<UsageStory[]> {
  if (!inFlight) {
    inFlight = apiRequest<UsageStoryListResponse>(STORIES_PATH)
      .then((response) => response.items)
      .catch((error: unknown) => {
        inFlight = undefined
        throw error
      })
  }
  return inFlight
}
