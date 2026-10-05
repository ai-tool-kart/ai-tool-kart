/*
 * The homepage's guide selection — "AI for Your Work".
 *
 * Pure: every input is passed in, nothing is read or cached here. The route
 * (http/routes/automations.ts, GET /home) supplies each configured niche's
 * active guides as the repository lists them, and the per-niche count from
 * config/limits.ts HOME_WORKFLOWS. Nothing here names a niche or a guide.
 *
 * ── Ranking ──────────────────────────────────────────────────────────────────
 *
 * The records carry no popularity, featured flag or rank, so the order is
 * derived from what they do carry, most decisive first:
 *
 *   1. editorial   a person wrote content for this guide (an overlay, or
 *                  authored steps) — the closest thing to "curated";
 *   2. trustScore  higher first;
 *   3. catalogue   more tools matched to a catalogue record — those cards
 *                  draw the tool's real monogram rather than derived letters;
 *   4. beginner    'yes', then 'somewhat', then 'no';
 *   5. position    the repository's import order — the final tie-break, so
 *                  the result never depends on sort stability.
 *
 * Deterministic: the same records always produce the same selection.
 *
 * ── "All" ────────────────────────────────────────────────────────────────────
 *
 * Built from the niche selections themselves, never from a second source: each
 * niche contributes its top ceil(perNiche / niches) guides, those are ranked
 * by the same comparator (configured niche order breaking a cross-niche tie),
 * and the first perNiche are kept — topped up from the niches' next guides
 * only if a small niche left a slot empty. With six niches and six slots that is each
 * niche's best guide — so "All" shows the breadth of the section rather than
 * whichever niche happens to hold the most trusted records.
 */

import { AutomationEditorialSchema } from './schema.ts'
import type { Automation } from './types.ts'

/** Every editorial field — the schema's own list, so a new field counts automatically. */
const EDITORIAL_FIELDS = Object.keys(AutomationEditorialSchema.shape) as (keyof Automation)[]

const BEGINNER_RANK: Record<Automation['beginnerFriendly'], number> = { yes: 0, somewhat: 1, no: 2 }

/** Whether a person wrote anything for this guide beyond the imported record. */
export function hasEditorial(automation: Automation): boolean {
  return EDITORIAL_FIELDS.some((field) => automation[field] !== undefined)
}

function catalogueMatches(automation: Automation): number {
  return automation.tools.filter((tool) => tool.catalogueSlug).length
}

/**
 * Orders two guides by signals 1–4. Zero means "equal on everything but
 * position" — the caller breaks that tie with its own order.
 */
export function compareForHome(a: Automation, b: Automation): number {
  return (
    Number(hasEditorial(b)) - Number(hasEditorial(a)) ||
    b.trustScore - a.trustScore ||
    catalogueMatches(b) - catalogueMatches(a) ||
    BEGINNER_RANK[a.beginnerFriendly] - BEGINNER_RANK[b.beginnerFriendly]
  )
}

/** Ranks a list best first; ties keep their input (import) order. Never mutates. */
export function rankForHome(automations: readonly Automation[]): Automation[] {
  return automations
    .map((automation, position) => ({ automation, position }))
    .sort((a, b) => compareForHome(a.automation, b.automation) || a.position - b.position)
    .map(({ automation }) => automation)
}

export interface HomeNicheInput {
  niche: string
  /** The niche's guides, in import order, as the repository lists them. */
  automations: readonly Automation[]
}

export interface HomeGroup {
  /** Every candidate before the cap — what "see all N" reports. */
  total: number
  items: Automation[]
}

export interface HomeNicheGroup extends HomeGroup {
  niche: string
}

export interface HomeSelection {
  /** Configured order; niches with no active guides are absent. */
  niches: HomeNicheGroup[]
  all: HomeGroup
}

export interface HomeSelectionInput {
  /** In configured (chip) order. */
  niches: readonly HomeNicheInput[]
  perNiche: number
}

export function selectHome({ niches, perNiche }: HomeSelectionInput): HomeSelection {
  const limit = Math.max(0, perNiche)
  const seenNiches = new Set<string>()
  const seenIds = new Set<string>()
  const groups: HomeNicheGroup[] = []

  for (const { niche, automations } of niches) {
    // A niche configured twice is shown once.
    if (seenNiches.has(niche)) continue
    seenNiches.add(niche)

    // Active guides of this niche only, each record at most once anywhere.
    const candidates = automations.filter(
      (automation) => automation.status === 'active' && automation.niche === niche && !seenIds.has(automation.id),
    )
    if (candidates.length === 0) continue

    const items = rankForHome(candidates).slice(0, limit)
    for (const item of items) seenIds.add(item.id)
    groups.push({ niche, total: candidates.length, items })
  }

  return { niches: groups, all: selectAll(groups, limit) }
}

function selectAll(groups: readonly HomeNicheGroup[], limit: number): HomeGroup {
  const total = groups.reduce((sum, group) => sum + group.total, 0)
  if (groups.length === 0 || limit === 0) return { total, items: [] }

  const share = Math.ceil(limit / groups.length)
  const entries = groups.flatMap((group, nicheOrder) =>
    group.items.map((automation, rank) => ({ automation, nicheOrder, rank })),
  )
  type Entry = (typeof entries)[number]
  const byRank = (a: Entry, b: Entry) =>
    compareForHome(a.automation, b.automation) || a.nicheOrder - b.nicheOrder || a.rank - b.rank

  // Each niche's share first; the rest only fill slots a small niche left empty.
  const shared = entries.filter((entry) => entry.rank < share).sort(byRank)
  const rest = entries.filter((entry) => entry.rank >= share).sort(byRank)
  const items = [...shared, ...rest].slice(0, limit).map(({ automation }) => automation)

  return { total, items }
}
