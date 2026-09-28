/*
 * Which guides a guide links to — the catalogue's internal-link graph.
 *
 * Pure: every input is passed in, nothing is read or cached here. The detail
 * route (http/routes/automations.ts) supplies the curated picks, the niche's
 * active guides in import order, and the matcher's ranking.
 *
 * ── Priority ─────────────────────────────────────────────────────────────────
 *
 *   1. curated     the editor's picks (editorial overlay), in their order;
 *   2. relevant    the same niche ranked by the search matcher against this
 *                  guide's title — the links a reader is most likely to want;
 *   3. neighbours  the next RELATED_NEIGHBOURS guides after this one in the
 *                  niche's import order, wrapping around.
 *
 * ── Why neighbours are reserved ──────────────────────────────────────────────
 *
 * Relevance alone concentrates links: the guides that match many titles are
 * picked by everyone, and most of the catalogue is linked by no one. The
 * previous fallback (the niche's first six) left 1,385 of 1,560 guides with no
 * inbound link from any other guide. Reserving two slots for the next guides
 * in a ring means guide i is always linked from guides i-1 and i-2, so every
 * guide in a niche of three or more has at least two inbound links — while
 * the other slots stay relevance-ranked.
 *
 * Every candidate is a real, active record; the current guide and duplicates
 * are never returned.
 */

import type { Automation } from './types.ts'

/** Slots always given to the ring neighbours — the in-link guarantee. */
export const RELATED_NEIGHBOURS = 2

export interface RelatedInput {
  automation: Automation
  /** Resolved curated picks, in editor order. May include drafts; they are skipped. */
  curated: (Automation | undefined)[]
  /** Every guide in the niche, in import order, as the repository lists it. */
  niche: Automation[]
  /** The niche ranked by relevance to this guide (the matcher's order). */
  ranked: Automation[]
  limit: number
}

export function selectRelated({ automation, curated, niche, ranked, limit }: RelatedInput): Automation[] {
  const taken = new Set<string>([automation.id])
  const result: Automation[] = []
  const take = (candidate: Automation | undefined): boolean => {
    if (!candidate || candidate.status !== 'active' || taken.has(candidate.id) || result.length >= limit) return false
    taken.add(candidate.id)
    result.push(candidate)
    return true
  }

  for (const pick of curated) take(pick)

  // The ring neighbours, chosen now so relevance cannot crowd them out.
  const active = niche.filter((candidate) => candidate.status === 'active')
  const at = active.findIndex((candidate) => candidate.id === automation.id)
  const neighbours: Automation[] = []
  if (at >= 0) {
    for (let step = 1; step < active.length && neighbours.length < RELATED_NEIGHBOURS; step++) {
      const candidate = active[(at + step) % active.length]
      if (candidate && !taken.has(candidate.id)) neighbours.push(candidate)
    }
  }
  const reserved = new Set(neighbours.map((candidate) => candidate.id))
  const room = Math.max(0, limit - result.length - neighbours.length)

  let added = 0
  for (const candidate of ranked) {
    if (added >= room) break
    if (reserved.has(candidate.id)) continue
    if (take(candidate)) added++
  }
  for (const candidate of neighbours) take(candidate)

  // A small niche, or a thin ranking: fill from the niche in order.
  for (const candidate of active) take(candidate)
  return result
}
