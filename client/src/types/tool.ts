/*
 * Domain types for an AI tool listing.
 *
 * Field names mirror the TOOLS array in the Claude Design handoff so the mock
 * data ports across without translation. When a real backend arrives, this is
 * the contract it should satisfy (or the adapter boundary).
 */

/** Pricing models used by the design's filter chips and tool records. */
export type PricingModel = 'Free' | 'Freemium' | 'Subscription' | 'Credits' | 'Usage-based'

/**
 * Every category value that appears on a tool.
 *
 * Note: this is wider than the 8 browsable categories in `Category` — the
 * design's tool data also uses "Research" and "Marketing", which have no
 * category tile. Kept faithful to the source rather than silently reassigned.
 */
export type ToolCategoryName =
  | 'Writing'
  | 'Image'
  | 'Code'
  | 'Video'
  | 'Audio'
  | 'Agents'
  | 'Data'
  | 'Design'
  | 'Research'
  | 'Marketing'

export interface Tool {
  id: string
  name: string
  /** Two-character monogram shown in the card avatar. */
  mono: string
  cat: ToolCategoryName
  model: PricingModel
  tagline: string
  rating: number
  reviews: number
  /** Display string, e.g. "Free · $18/mo" — not a parseable amount. */
  price: string
  /** Week-over-week growth badge, e.g. "+142%". */
  trend: string
  /** Editorial badge; empty string means none. */
  badge: string
  tags: string[]
  /** Popularity score, drives the default "Most popular" sort. */
  pop: number
  api: string
  ctx: string
  team: string
  trial: string
  integr: string
}

/** Sort options offered on the Browse page. */
export type SortOption = 'Most popular' | 'Highest rated' | 'Most reviewed' | 'A–Z'

/** Browse filter state. `cat`/`price` use the design's sentinel "all" values. */
export interface ToolFilters {
  q: string
  cat: string
  price: string
  minRating: number
  sort: SortOption
}
