import type { BeginnerFriendly, NicheName } from '@/types/automation'
import type { PricingTierName } from '@/types/tool'

/*
 * Reader-facing wording for automation fields, shared by the card and the
 * detail page so the two never describe the same record differently.
 */

/**
 * The same wording the assistant's plan uses (PlanBodies' priceLabel): "Free"
 * only for a fully free tool, "Free plan" when a paid tier sits behind it.
 * Only ever called with a tier the API actually sent.
 */
export function priceLabel(tier: PricingTierName): string {
  if (tier === 'free') return 'Free'
  if (tier === 'freemium') return 'Free plan'
  return 'Paid'
}

export function beginnerLabel(value: BeginnerFriendly): string {
  if (value === 'yes') return 'Beginner-friendly'
  if (value === 'somewhat') return 'Some setup'
  return 'Advanced setup'
}

/** The detail route for one automation. Niche and slug: slugs repeat across niches. */
export function automationPath(niche: NicheName, slug: string): string {
  return `/automations/${encodeURIComponent(niche)}/${encodeURIComponent(slug)}`
}

/** The small uppercase pill the plan panel uses for its price label. */
export const META_PILL =
  'inline-flex w-fit items-center rounded-pill border border-white/[0.09] bg-white/[0.03] px-[8px] py-[2px] text-[10.5px] font-semibold tracking-[0.04em] text-[#9E97B8] uppercase'
