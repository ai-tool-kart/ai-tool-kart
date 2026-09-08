import type { ToolCategoryName } from '@/types/tool'

/*
 * A "popular way to use AI" — the homepage's outcome-first entry point.
 *
 * This is EDITORIAL PRODUCT CONTENT, not a catalogue record. It names an
 * outcome a reader recognises ("Edit videos") and points at the slice of the
 * catalogue that serves it. It deliberately carries no tool metadata: no
 * ratings, no pricing, no logos, no tool names. Everything factual on the card
 * — how many tools there are, what they are about — is asked of the catalogue
 * at render time through hooks/usePopularWays.ts.
 *
 * The split matters. If a "way" carried its own tool list it would become a
 * second, stale catalogue living in the frontend, and its "8 tools" would drift
 * from what Browse actually shows the moment the real catalogue changed. What
 * stays here is only the part the catalogue cannot know: which outcome is worth
 * putting on the homepage, and what to call it.
 *
 * Source of the labels, notes, badges and cues: the final Claude Design handoff
 * (ai-tool-kart-pre-final-design — `USE_CASES`). The category mapping is ours,
 * because the prototype had no backend to map onto.
 */

/** Which drawing the card shows. Keys `POPULAR_WAY_ICONS` in the icon module. */
export type PopularWayIconName =
  | 'audience'
  | 'compose'
  | 'clock'
  | 'video'
  | 'study'
  | 'trend'

export interface PopularWay {
  /** Stable key. Also the React list key and the summary-map key. */
  id: string
  /** The outcome, in the reader's words. Design: `label`. */
  label: string
  /** One line of orientation under the label. Design: `note`. */
  note: string
  /** Optional editorial flag ("Most used", "Popular", "Quick win"). */
  badge?: string
  /** The design's positioning line, shown in the card's footer chip. */
  cue: string
  /** The drawing in the card's icon tile. */
  icon: PopularWayIconName
  /**
   * The catalogue slice this outcome maps to.
   *
   * These are the ONLY values that leave this file for the API, and they are
   * checked against GET /api/taxonomy before any request is built — see
   * hooks/usePopularWays.ts. Multiple categories are OR-ed, exactly as
   * `/browse?cat=A&cat=B` is.
   */
  categories: ToolCategoryName[]
}
