import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import type { BillingPeriod, PricingTier } from '@/types/pricing'

/** Plan tier card, with the highlighted-border variant for the featured tier. */

interface PricingCardProps {
  tier: PricingTier
  billing: BillingPeriod
  /** Where the tier CTA goes. The design routes every tier CTA to Submit. */
  ctaTo?: string
}

export default function PricingCard({ tier, billing, ctaTo = '/submit' }: PricingCardProps) {
  const annual = billing === 'annual'
  const price = annual ? tier.annualPrice : tier.monthlyPrice
  const unit = annual ? tier.annualUnit : tier.monthlyUnit

  return (
    <div
      data-reveal="stagger"
      className="relative flex flex-col gap-[18px] rounded-panel border border-hairline bg-white/[0.035] p-8 shadow-[0_1px_2px_rgba(0,0,0,0.40),0_14px_34px_-26px_rgba(0,0,0,0.90)] transition-[transform,box-shadow] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[6px] hover:shadow-[0_2px_6px_rgba(0,0,0,0.46),0_34px_60px_-30px_rgba(116,80,244,0.5)]"
    >
      {tier.highlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-panel border-[1.5px] border-[rgba(154,110,255,0.6)] shadow-[0_20px_50px_-34px_rgba(116,80,244,0.8)]"
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-[19px] font-semibold text-ink">{tier.name}</div>
        {tier.tag && <Badge variant="accent">{tier.tag}</Badge>}
      </div>

      <div className="flex items-end gap-2">
        <div className="text-[52px] leading-[0.9] font-bold tracking-[-0.04em] text-ink">
          {price}
        </div>
        <div className="pb-[5px] text-[13.5px] text-subtle">{unit}</div>
      </div>

      <div className="text-[14.5px] leading-[1.55] text-pretty text-muted">{tier.blurb}</div>

      <div className="flex flex-auto flex-col gap-[10px]">
        {tier.features.map((feature) => (
          <div
            key={feature}
            className="flex gap-[10px] text-[14px] leading-[1.45] text-[#D6D2E6]"
          >
            <span className="flex-none text-accent-strong">✓</span>
            <span>{feature}</span>
          </div>
        ))}
      </div>

      <Button variant="gradient" to={ctaTo} fullWidth className="py-[14px] text-[14.5px]">
        {tier.cta}
      </Button>
    </div>
  )
}
