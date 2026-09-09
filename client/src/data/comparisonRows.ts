import type { ComparisonRow } from '@/types/content'
import { formatRatingWithReviews } from '@/utils/format'

/*
 * Comparison-table row definitions, ported from `compareFullRows` (Compare
 * page) in the handoff.
 *
 * Each row is an accessor over a Tool rather than a literal cell, so the table
 * renders from whatever tools are selected.
 *
 * The handoff's `compareRows` — the 5-row teaser — was ported as
 * COMPARE_TEASER_ROWS and is gone with the Home compare teaser that was its
 * only consumer. The final design has no such teaser on Home.
 */

/** The full 9-row table on the Compare page. */
export const COMPARE_FULL_ROWS: ComparisonRow[] = [
  { label: 'Category', cell: (t) => t.cat },
  { label: 'Pricing model', cell: (t) => t.model },
  { label: 'Starting price', cell: (t) => t.price },
  { label: 'Editor rating', cell: (t) => formatRatingWithReviews(t.rating, t.reviews) },
  { label: 'Context / limits', cell: (t) => t.ctx },
  { label: 'Public API', cell: (t) => t.api },
  { label: 'Team plan', cell: (t) => t.team },
  { label: 'Free trial', cell: (t) => t.trial },
  { label: 'Integrations', cell: (t) => t.integr },
]

/** Tools pre-selected in the three compare columns, as in the design. */
export const DEFAULT_COMPARE_SELECTION = ['Nova Write', 'Draftsmith', 'Relay Agents']
