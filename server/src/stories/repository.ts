/*
 * THE USAGE-STORY PORT.
 *
 * An interface and its query type. No implementation, no storage vocabulary, no
 * import of anything under data/ — the same three rules catalogue/repository.ts
 * holds, for the same reason: the JSON file is a V1 detail, and the day these
 * become rows the change must touch one file.
 *
 * ── Why this is a separate port and not a catalogue method ───────────────────
 *
 * A usage story is not a tool and does not belong on ToolCatalogueRepository. It
 * is EDITORIAL CONTENT that happens to reference the catalogue by slug, and the
 * two have different lifecycles: the catalogue is grown by intake, the stories
 * are written. Hanging `listStories()` off the tool port would mean the
 * PostgreSQL catalogue adapter had to implement a content API it has nothing to
 * do with.
 *
 * The reference direction is one-way and deliberate: a story names tools by
 * slug, and NOTHING in the catalogue knows a story exists.
 *
 * ── Why the repository does not resolve tools ────────────────────────────────
 *
 * `toolSlugs` is returned as written. It would be easy for this layer to join
 * against the catalogue and hand back whole Tool objects — and that is exactly
 * what would duplicate tool metadata into a second place, which the section is
 * specifically built not to do. The client already holds the whole catalogue in
 * one cached read, so the join is free where it happens; here it would be a
 * second copy of a tool's name in a second response shape, drifting the moment
 * a tool is renamed.
 */

import type { UsageStory } from '../domain/types.ts'

/**
 * A usage-story query.
 *
 * Deliberately tiny. There is one consumer, one ordering and a couple of dozen
 * records at most; a facet nobody asks for is a facet nobody has tested.
 */
export interface UsageStoryQuery {
  /** Cap on returned stories. Omitted means all of them. */
  limit?: number
}

export interface UsageStoryRepository {
  /** Which adapter is behind the port: 'json' now, something else later. */
  readonly id: string
  /** Stories in their editorial order, lowest `order` first. */
  list(query?: UsageStoryQuery): Promise<UsageStory[]>
  /** How many stories exist. */
  size(): Promise<number>
}
