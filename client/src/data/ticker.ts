/*
 * The announcement ticker above the nav pill.
 *
 * Ported from the marquee rail in the final design
 * (ai-tool-kart-pre-final-design/project/AI Tool Kart Site.dc.html, [data-header]).
 *
 * PLACEHOLDER CONTENT. These five lines are the design's own copy. The News
 * Agent in `news agent/` already produces exactly this kind of item, so this
 * array is the seam it replaces — nothing outside src/data should hard-code
 * ticker text, and NewsTicker takes TickerItem[] as input.
 */

export interface TickerItem {
  text: string
  /** Shows the violet "NEW" flag before the text. The design flags only the first. */
  isNew?: boolean
}

export const TICKER_ITEMS: TickerItem[] = [
  { text: 'Runway Gen-3 Alpha is now available', isNew: true },
  { text: 'Claude 3.5 Sonnet launched' },
  { text: 'OpenAI introduces GPT-4o' },
  { text: 'Midjourney v7 opens to all members' },
  { text: '61 new tools indexed this week' },
]
