import { apiRequest } from '@/services/http'
import type { Taxonomy } from '@/types/taxonomy'

/*
 * GET /api/taxonomy.
 *
 * One request, cached for the life of the page. The taxonomy is the catalogue's
 * vocabulary, not live data: it changes when the server is redeployed, never
 * between two renders. Without the cache every consumer — the Browse chip row,
 * the sort control, the assistant's setup pickers — would fetch it separately on
 * mount, which is three identical requests for a constant.
 *
 * ── Why this one takes no AbortSignal ────────────────────────────────────────
 *
 * The promise is SHARED: three components mounting in the same tick make one
 * request and all await it. Wiring a caller's signal into it would let whichever
 * component happened to unmount first abort the request the other two are still
 * waiting on. So the fetch is deliberately uncancellable — it is a few hundred
 * bytes for a constant — and cancellation is handled where it belongs, in the
 * hook, which simply ignores a result that arrives after unmount.
 *
 * A rejection clears the slot so a later mount retries rather than replaying the
 * same failure forever.
 */

const TAXONOMY_PATH = '/taxonomy'

let inFlight: Promise<Taxonomy> | undefined

export async function getTaxonomy(): Promise<Taxonomy> {
  if (!inFlight) {
    inFlight = apiRequest<Taxonomy>(TAXONOMY_PATH).catch((error: unknown) => {
      inFlight = undefined
      throw error
    })
  }
  return inFlight
}
