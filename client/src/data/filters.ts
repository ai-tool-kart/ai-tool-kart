import { CATEGORIES } from '@/data/categories'

/*
 * Form vocabularies for the surfaces that are NOT the catalogue.
 *
 * Browse no longer reads this file. Its categories, pricing tiers and sort
 * options come from GET /api/taxonomy, because those are the catalogue's own
 * vocabulary and a second copy here is how the UI drifts into sending values
 * the API rejects. What is left is genuinely local: the option lists a
 * submission form offers, which describe what a person may TYPE rather than
 * what the catalogue contains.
 */

/** Sentinel values the design uses for "no filter applied". */
export const ALL_CATEGORIES = 'All categories'
export const ANY_PRICE = 'Any'

/** Pricing-model chips still used by the kitchen-sink surface. */
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
