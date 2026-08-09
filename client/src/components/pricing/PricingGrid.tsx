import PricingCard from '@/components/pricing/PricingCard'
import type { BillingPeriod, PricingTier } from '@/types/pricing'

/** 3-up grid of plan tiers. */

interface PricingGridProps {
  tiers: PricingTier[]
  billing: BillingPeriod
}

export default function PricingGrid({ tiers, billing }: PricingGridProps) {
  return (
    <div className="grid grid-cols-3 gap-5 text-left">
      {tiers.map((tier) => (
        <PricingCard key={tier.name} tier={tier} billing={billing} />
      ))}
    </div>
  )
}
