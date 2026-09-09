import { apiRequest } from '@/services/http'
import type { WorkSavingsEstimate } from '@/types/workSavings'

/*
 * GET /api/work-savings.
 *
 * One request, cached for the life of the page — the same shape as
 * services/taxonomy.ts and services/usageStories.ts, and for the same reason.
 * These are editorial records that change when the server is redeployed, never
 * between two renders, and the homepage mounts exactly one consumer.
 *
 * ── One request, not one per selection ───────────────────────────────────────
 *
 * The whole set is fetched once and the selector switches between estimates in
 * memory. Fifteen records is a couple of kilobytes; a request per dropdown
 * change would put a network round trip between a reader and a number that was
 * already on their machine.
 *
 * ── Why this takes no AbortSignal ────────────────────────────────────────────
 *
 * The promise is SHARED. Wiring a caller's signal into it would let whichever
 * component unmounted first abort a request another was still waiting on. So the
 * fetch is deliberately uncancellable and cancellation is handled in the hook,
 * which ignores a result arriving after unmount.
 *
 * A rejection clears the slot so a later mount retries rather than replaying the
 * same failure forever.
 */

const SAVINGS_PATH = '/work-savings'

/** GET /api/work-savings — `WorkSavingsListResponse` on the server. */
interface WorkSavingsListResponse {
  items: WorkSavingsEstimate[]
  /** Total held, which equals `items.length` unless a limit was sent. */
  total: number
}

let inFlight: Promise<WorkSavingsEstimate[]> | undefined

export async function getWorkSavings(): Promise<WorkSavingsEstimate[]> {
  if (!inFlight) {
    inFlight = apiRequest<WorkSavingsListResponse>(SAVINGS_PATH)
      .then((response) => response.items)
      .catch((error: unknown) => {
        inFlight = undefined
        throw error
      })
  }
  return inFlight
}
