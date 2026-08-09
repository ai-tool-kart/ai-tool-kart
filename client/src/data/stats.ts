import type { Stat } from '@/types/content'

/*
 * Hero stats, ported from `stats` in the handoff.
 *
 * These are editorial copy, NOT derived from TOOLS/CATEGORIES — the design
 * claims 2,412 tools and 38 categories while shipping 12 and 8. Kept as literal
 * strings because deriving them would visibly change the design. Revisit when a
 * real data source exists.
 */

export const HERO_STATS: Stat[] = [
  { value: '2,412', label: 'tools indexed' },
  { value: '38', label: 'categories' },
  { value: '190k', label: 'monthly searches' },
  { value: '48 hrs', label: 'review turnaround' },
]
