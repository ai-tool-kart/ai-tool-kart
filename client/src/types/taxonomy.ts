/*
 * GET /api/taxonomy — the catalogue's own vocabulary.
 *
 * This is the ONLY place category names, pricing tiers and sort options enter
 * the frontend. They are not restated in a data file, a filter constant or a
 * component: the server owns them, the API serves them, and a chip row renders
 * whatever comes back. That is what stops a category being renamed on the
 * server and silently 400-ing every request the UI builds.
 *
 * The endpoint returns nine fields; the five the frontend reads are declared
 * here. `useCases` and `categoryGroups` are left out until something needs them.
 */

import type { PricingTierName, SortOption, ToolCategoryName } from '@/types/tool'

/** One workflow stage with the label the design shows for it. */
export interface StageDefinition {
  id: string
  label: string
}

/** A sort option paired with its display label ("popular" → "Most popular"). */
export interface SortDefinition {
  value: SortOption
  label: string
}

export interface Taxonomy {
  /** The ten browsable categories, in the server's order. */
  categories: ToolCategoryName[]
  /** The three tiers `GET /api/tools?price=` actually filters on. */
  pricingTiers: PricingTierName[]
  /** Display-only pricing vocabulary. NOT a filter key — see the note below. */
  pricingModels: string[]
  stages: StageDefinition[]
  sorts: SortDefinition[]
  /** Role labels for the assistant's setup pickers (Milestone 2). */
  roles: string[]
  /** Goals per role. A role with no entry falls back to a generic list. */
  goalsByRole: Record<string, string[]>
}

/*
 * ── pricingModels vs pricingTiers, because they look interchangeable ─────────
 *
 * `pricingModels` is the five-value display vocabulary the design's chips were
 * drawn from (Free, Freemium, Subscription, Credits, Usage-based) and matches a
 * tool's `model` field. `pricingTiers` is the three-value axis the API filters
 * on (free, freemium, paid) and matches `pricingTier`.
 *
 * Only the tiers are a filter. Filtering the UI by `model` would need the whole
 * catalogue in the browser to do it client-side, and two of the five values
 * ("Credits", "Usage-based") match nothing in the seeded catalogue anyway. So
 * the Refine panel filters on TIERS and says so.
 */
