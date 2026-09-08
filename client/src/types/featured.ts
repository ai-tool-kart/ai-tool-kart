/*
 * The editors' desk: which tools the homepage features today.
 *
 * Editorial product content, and nothing else. A featured entry is a POINTER —
 * a catalogue slug, an optional badge, and an optional media override — so every
 * fact on the rendered card (name, category, description, rating, review count,
 * monogram, vendor) is read from the live record. Nothing here restates a tool.
 *
 * ── Why a badge lives here and not on the tool ───────────────────────────────
 *
 * "Editors' choice" and "Best value" are claims THIS SECTION makes about a tool
 * this week. They are not properties of the tool, they must not follow it into
 * Browse, and they must not be achieved by writing to the catalogue's own
 * `badge` field — which is the curator's, is derived on Browse from `badge`/`pop`
 * (components/catalogue/toolCardTone.ts), and means something different. Two
 * separate badge systems, deliberately never mixed.
 *
 * Source: the final Claude Design handoff — the Today's Pick card and the
 * `featuredPicks` array.
 */

import type { ToolMediaFields } from '@/types/media'

/**
 * Section-level media, for a tool whose own record has none yet.
 *
 * A stopgap that is expected to stay empty: real imagery belongs on the tool,
 * not on the week's editorial pick. It exists so a single hero shot can be hung
 * on Today's Pick without waiting for the media layer — see utils/toolMedia.ts
 * for where it sits in the resolution order.
 */
export type FeaturedMediaOverride = Pick<ToolMediaFields, 'logoUrl' | 'bannerImageUrl'>

export interface FeaturedTool {
  /** The catalogue slug. The only link between this file and a real tool. */
  slug: string
  /** This section's own label. Most entries have none. */
  badge?: string
  media?: FeaturedMediaOverride
}

/**
 * The whole selection.
 *
 * Today's Pick is a named field rather than a `role: 'today'` discriminant, and
 * the rest are an array rather than carrying an `order` number: there is exactly
 * one pick, the array's order IS the display order, and both facts are then
 * impossible to get wrong. Changing the week's pick is editing one line.
 */
export interface FeaturedSelection {
  todaysPick: FeaturedTool
  alsoFeatured: FeaturedTool[]
}
