/*
 * THE WORK-SAVINGS PORT.
 *
 * An interface and its query type. No implementation, no storage vocabulary, no
 * import of anything under data/ — the same rules catalogue/repository.ts and
 * stories/repository.ts hold, for the same reason: the JSON file is a V1 detail
 * and the day these become rows the change must touch one file.
 *
 * ── What this resource is, and is not ────────────────────────────────────────
 *
 * It is EDITORIAL CONTENT: a written estimate of what AI-assisted work looks
 * like for a kind of work. It is NOT a calculation engine and must not become
 * one. There is no arithmetic anywhere behind this port — no rates, no
 * multipliers, no per-user inputs — because the moment a number here is computed
 * rather than written, the section starts making a quantitative claim the
 * project has no measurement behind.
 *
 * ── Why it is separate from the catalogue and from stories ───────────────────
 *
 * A savings estimate is keyed on a KIND OF WORK, not on a tool and not on a
 * person. It references the catalogue's role vocabulary where one matches
 * (`catalogueRole`) so the site does not grow a second set of role names, but it
 * holds no tool and resolves nothing. Nothing in the catalogue knows this
 * resource exists.
 */

import type { WorkSavingsEstimate } from '../domain/types.ts'

/**
 * A work-savings query.
 *
 * Deliberately tiny. One consumer, one ordering, fifteen records: the client
 * fetches the whole set once and switches between estimates locally, so there is
 * no filter to offer and no page to turn.
 */
export interface WorkSavingsQuery {
  /** Cap on returned estimates. Omitted means all of them. */
  limit?: number
}

export interface WorkSavingsRepository {
  /** Which adapter is behind the port: 'json' now, something else later. */
  readonly id: string
  /** Estimates in their editorial order, lowest `order` first. */
  list(query?: WorkSavingsQuery): Promise<WorkSavingsEstimate[]>
  /** How many estimates exist. */
  size(): Promise<number>
}
