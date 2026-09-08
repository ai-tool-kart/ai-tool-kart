import type { FeaturedSelection } from '@/types/featured'

/*
 * This week's editors' desk.
 *
 * Ported from the final design handoff: the Today's Pick card (Claude, badged
 * "Editors' choice") and its `featuredPicks` array — Midjourney, Runway,
 * ChatGPT, Perplexity, ElevenLabs, in that order, with three of the five badged.
 *
 * All six exist in the catalogue under the slugs below, so nothing was
 * substituted or dropped. Two things from the prototype are deliberately absent:
 *
 *  - its RATINGS (Midjourney 4.8, Runway 4.7, ElevenLabs 4.8). The catalogue's
 *    real values are 4.7, 4.5 and 4.4, and those are what render. A featured
 *    card and a Browse card must never disagree about the same tool;
 *  - its NAMES and CATEGORIES ("Claude 3.5 Sonnet", "AI Image", "AI Chatbot").
 *    The catalogue says Claude, Image and Agents, and the catalogue is the
 *    record. See the section component for that note.
 *
 * ── This is an editorial choice, not a computed one ──────────────────────────
 *
 * Today's Pick is NOT the highest-rated, most-reviewed or most-popular tool, and
 * must not become one: Perplexity and Midjourney both out-review Claude, and
 * three tools share its `pop` of 95. It is a pick, and a pick is a person's
 * judgement. Keeping it as one line of config is what lets it change weekly
 * without touching a component.
 */

export const FEATURED_SELECTION: FeaturedSelection = {
  todaysPick: { slug: 'claude', badge: "Editors' choice" },
  alsoFeatured: [
    { slug: 'midjourney', badge: 'Best output' },
    { slug: 'runway' },
    { slug: 'chatgpt', badge: 'Most used' },
    { slug: 'perplexity' },
    { slug: 'elevenlabs', badge: 'Best value' },
  ],
}
