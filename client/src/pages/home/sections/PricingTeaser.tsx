import { useState } from 'react'
import Section from '@/components/layout/Section'
import BillingToggle from '@/components/pricing/BillingToggle'
import PricingGrid from '@/components/pricing/PricingGrid'
import SectionHeading from '@/components/ui/SectionHeading'
import { PRICING_TIERS } from '@/data/pricing'
import type { BillingPeriod } from '@/types/pricing'

/** Pricing preview. Annual is the design's default (annualDefault: true). */

export default function PricingTeaser() {
  const [billing, setBilling] = useState<BillingPeriod>('annual')

  return (
    <Section center>
      <SectionHeading
        eyebrow="Pricing"
        title="Free to browse. Pay when it saves you time."
        center
      />
      <div className="mt-[26px]">
        <BillingToggle value={billing} onChange={setBilling} />
      </div>
      <div className="mt-[34px]">
        <PricingGrid tiers={PRICING_TIERS} billing={billing} />
      </div>
    </Section>
  )
}
