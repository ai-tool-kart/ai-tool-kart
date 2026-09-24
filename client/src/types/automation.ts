import type { PricingTierName } from '@/types/tool'

/*
 * The automations contract.
 *
 * Mirrors the server's projections in server/src/http/routes/automations.ts —
 * `ApiAutomationCard` (the list) and `ApiAutomation` (the detail) — FIELD FOR
 * FIELD. The server is authoritative; if the two ever disagree, this file is
 * the one that is wrong.
 *
 * What the API never sends, and so this file never declares: `pricingNote`
 * (stored, never rendered — SPEC-automations.md §6), `status`, and
 * `pricingTierSource`. `pricingTier` is OPTIONAL on purpose: the server omits it
 * when no pricing rule recognised the source's note, and a missing badge is
 * the honest rendering of that — never a guessed "Paid".
 */

/**
 * The niche vocabulary — server/src/catalogue/taxonomy.ts `NICHES`, verbatim
 * and in the same order.
 *
 * Mirrored rather than fetched because no endpoint serves it yet. It has to be
 * exact: the API answers an unknown niche with a 400 for the whole request, so
 * a chip the server does not know would break the page rather than filter it.
 */
export const NICHES = [
  'Accountants & Bookkeepers',
  'Coaches',
  'Content Creators-Writers',
  'Contractors & Home Services',
  'Customer Support Teams',
  'Event Planners',
  'Fitness-Salon-Personal Services',
  'Freelancers-Consultants',
  'Hotels & Hospitality',
  'Job Seekers-Career Changers',
  'Marketing Agencies',
  'Office & Operations Managers',
  'Photographers & Videographers',
  'Property Managers',
  'Real Estate',
  'Recruiters & HR',
  'Restaurants',
  'Retail-E-commerce Small Biz',
  'Sales Teams',
  'Small Businesses',
  'Startup Founders',
  'Students',
  'Teachers & Educators',
  'Travel Agencies',
  'Virtual Assistants',
] as const

export type NicheName = (typeof NICHES)[number]

export function isNiche(value: string | null | undefined): value is NicheName {
  return value != null && (NICHES as readonly string[]).includes(value)
}

export type BeginnerFriendly = 'yes' | 'somewhat' | 'no'

/**
 * A hand-chosen link from editorial content (a usage story, a setup, a Build
 * role) to one guide. Niche and slug together: slugs repeat across niches.
 * That each stored pair names a real guide is pinned by
 * server/tests/guideLinks.test.ts against the imported automations.
 */
export interface AutomationRef {
  niche: NicheName
  slug: string
}

/** One result card — GET /api/automations `items[]`. */
export interface AutomationCard {
  slug: string
  niche: NicheName
  title: string
  persona: string
  /** Names only. Links live on the detail view. */
  tools: string[]
  beginnerFriendly: BeginnerFriendly
  /** Absent when the source's pricing could not be classified. */
  pricingTier?: PricingTierName
}

/** One tool an automation names. Only the first carries a url. */
export interface AutomationTool {
  name: string
  url?: string
  /** A real catalogue record's slug, set only on a confident match. */
  catalogueSlug?: string
  accessNote?: string
}

/** One step — authored, or one of the three the server derives. */
export interface AutomationStep {
  title: string
  /** Absent on the derived "Use this prompt" step. */
  body?: string
  /** Rendered in a bordered block with a copy button. */
  prompt?: string
  toolName?: string
  tip?: string
}

/** GET /api/automations/:niche/:slug `automation`. */
export interface AutomationDetail {
  id: string
  slug: string
  kind: 'workflow' | 'mcp'
  niche: NicheName
  /** The source's own Niche/Industry wording, often more specific than `niche`. */
  sector?: string
  persona: string
  title: string
  intentLabels: string[]
  tools: AutomationTool[]
  workflowSummary: string
  samplePrompt: string
  beginnerFriendly: BeginnerFriendly
  beginnerNote?: string
  trustScore: 1 | 2 | 3 | 4 | 5
  pricingTier?: PricingTierName
  sourceUrl: string
  sourceType: string
  freshness: string
  accessNotes?: string
  batch: string
  steps: AutomationStep[]
}

/** What the list page filters on. Both live in the URL. */
export interface AutomationFilters {
  q: string
  /** Undefined means every niche. */
  niche?: NicheName
}
