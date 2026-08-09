import type { SortOption } from '@/types/tool'
import { CATEGORIES } from '@/data/categories'

/*
 * Filter/sort vocabularies, ported from `sortOptions`, `priceFilters`,
 * `catOptions` and `modelNames` in the handoff.
 */

/** Sentinel values the design uses for "no filter applied". */
export const ALL_CATEGORIES = 'All categories'
export const ANY_PRICE = 'Any'

export const SORT_OPTIONS: SortOption[] = [
  'Most popular',
  'Highest rated',
  'Most reviewed',
  'A–Z',
]

/** Pricing-model chips on the Browse sidebar (includes the "Any" sentinel). */
export const PRICE_FILTERS: string[] = [
  ANY_PRICE,
  'Free',
  'Freemium',
  'Subscription',
  'Credits',
  'Usage-based',
]

/** Pricing models offered in the Submit form (no sentinel). */
export const MODEL_NAMES: string[] = [
  'Free',
  'Freemium',
  'Subscription',
  'Credits',
  'Usage-based',
]

/** Category dropdown options, including the "All categories" sentinel. */
export const CATEGORY_OPTIONS: string[] = [
  ALL_CATEGORIES,
  ...CATEGORIES.map((c) => c.name),
]

export const POPULAR_SEARCHES: string[] = [
  'summarize sales calls',
  'product photography',
  'PR review',
  'meeting notes',
  'SQL from plain English',
]
