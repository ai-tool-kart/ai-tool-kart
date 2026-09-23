/*
 * THE AUTOMATIONS PORT.
 *
 * An interface and its query type. No implementation, no storage vocabulary,
 * no import of anything under data/ — the rules catalogue/repository.ts and
 * stories/repository.ts hold, for the same reason: the JSON files are a V1
 * detail, and the day automations become rows the change must touch one file.
 *
 * Read-only. The importer (server/scripts/importAutomations.ts) writes the
 * data files offline and they reach the server through a commit, so there is
 * no write method here and there must not be one.
 *
 * ── Slugs are unique within a niche, not globally ────────────────────────────
 *
 * The importer assigns slugs per niche, and two niches can and do share one
 * ("i-want-a-chatbot-on-my-website-that-can-answer-customer" is both a
 * Contractors & Home Services and a Small Businesses automation). So a slug
 * lookup always takes the niche with it. `id` is the only global key.
 *
 * ── Drafts ───────────────────────────────────────────────────────────────────
 *
 * Same split as the catalogue: lookups by identity (`findBySlug`,
 * `findManyByIds`) reach every record, listings return active ones only.
 * Status filtering is a listing concern.
 */

import type { CatalogueKind } from '../domain/types.ts'
import type { Automation } from './types.ts'

/**
 * An automations listing query. Every field narrows; omitting one means "do
 * not constrain on this".
 */
export interface AutomationQuery {
  /** Absent means both kinds — the same "absent is no filter" rule as ToolQuery.kind. */
  kind?: CatalogueKind
  niche?: string
  /** Cap on returned automations. Omitted means all of them. */
  limit?: number
}

export interface AutomationRepository {
  /** Which adapter is behind the port: 'json' now, something else later. */
  readonly id: string
  /** One automation by its niche and slug. Undefined when either is unknown. */
  findBySlug(niche: string, slug: string): Promise<Automation | undefined>
  /** A niche's active automations, in import order. Empty for an unknown niche. */
  listByNiche(niche: string): Promise<Automation[]>
  /** Active automations, in import order (niche file, then row). */
  list(query?: AutomationQuery): Promise<Automation[]>
  /** Unknown ids are dropped. Order follows the store, not the input. */
  findManyByIds(ids: string[]): Promise<Automation[]>
  /** Active records only — the number a health check would report. */
  size(): Promise<number>
}
