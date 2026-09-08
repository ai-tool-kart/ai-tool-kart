import type { PopularWay } from '@/types/popularWay'

/*
 * The six outcomes on the homepage's "Popular Ways to Use AI" rail.
 *
 * Copy is the final design's `USE_CASES` array, verbatim — labels, notes,
 * badges and cues. What is NOT from the design is `categories`: the prototype's
 * cards all navigated to a bare browse view because it had no catalogue to
 * filter. Each one is mapped here onto the categories the server's taxonomy
 * actually publishes, so a card's count, its topics and its link all describe
 * the same slice of the real catalogue.
 *
 * Two of the design's fields are deliberately absent:
 *
 *  - the tool count ("8 tools"), because the catalogue knows it and this file
 *    would only get it wrong;
 *  - the topic list ("Lead gen · Follow-ups · Ads"), because the catalogue's
 *    own tags say the same thing about the tools that are really there.
 *
 * Both are resolved at render time. See hooks/usePopularWays.ts.
 *
 * ── A note on `cue` ──────────────────────────────────────────────────────────
 *
 * The cues are the handoff's marketing copy ("Save 6–8 hrs a week"). They are
 * claims about the product, not facts derived from the catalogue, which is why
 * they live in an editorial file rather than being inferred from anything.
 */

export const POPULAR_WAYS: PopularWay[] = [
  {
    id: 'customers',
    label: 'Get more customers',
    note: 'Marketing and outreach',
    badge: 'Most used',
    cue: 'Best for outreach',
    icon: 'audience',
    categories: ['Marketing'],
  },
  {
    id: 'content',
    label: 'Create content',
    note: 'Writing, image, video',
    badge: 'Popular',
    cue: 'Save 6–8 hrs a week',
    icon: 'compose',
    // The note names three categories; the filter says the same thing.
    categories: ['Writing', 'Image', 'Video'],
  },
  {
    id: 'admin',
    label: 'Save admin time',
    note: 'Automation and agents',
    cue: 'Set up in an afternoon',
    icon: 'clock',
    categories: ['Agents'],
  },
  {
    id: 'video',
    label: 'Edit videos',
    note: 'Cuts, clips, captions',
    badge: 'Quick win',
    cue: 'Best for creators',
    icon: 'video',
    categories: ['Video'],
  },
  {
    id: 'study',
    label: 'Study smarter',
    note: 'Research and summaries',
    cue: 'Beginner friendly',
    icon: 'study',
    categories: ['Research'],
  },
  {
    id: 'business',
    label: 'Plan my business',
    note: 'Strategy and analysis',
    cue: 'Best for founders',
    icon: 'trend',
    // "Strategy and analysis" is the market-facing half of Research plus the
    // numbers half of Data. Agents is left out on purpose — it is what the
    // "Save admin time" card is for, and a reader who taps two cards expecting
    // two different shelves should get two different shelves.
    categories: ['Data', 'Research'],
  },
]
