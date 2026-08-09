import { BILLING_LABELS } from '@/data/pricing'
import type { BillingPeriod } from '@/types/pricing'

/** Segmented Monthly / Annual control. */

interface BillingToggleProps {
  value: BillingPeriod
  onChange: (value: BillingPeriod) => void
}

const PERIODS: BillingPeriod[] = ['monthly', 'annual']

export default function BillingToggle({ value, onChange }: BillingToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-pill border border-white/[0.09] bg-white/[0.04] p-[5px]">
      {PERIODS.map((period) => {
        const active = value === period
        return (
          <button
            key={period}
            type="button"
            onClick={() => onChange(period)}
            className={`relative cursor-pointer rounded-pill px-[18px] py-[9px] text-[14px] font-semibold transition-colors duration-200 ${
              active ? 'text-white' : 'text-muted-soft hover:text-ink'
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-pill border border-white/[0.16] bg-[image:var(--gradient-cta)] shadow-[0_8px_18px_-10px_rgba(116,80,244,0.9)]"
              />
            )}
            <span className="relative">{BILLING_LABELS[period]}</span>
          </button>
        )
      })}
    </div>
  )
}
