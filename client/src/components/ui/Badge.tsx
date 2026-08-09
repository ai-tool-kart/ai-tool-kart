import type { ReactNode } from 'react'

/*
 * Uppercase badge.
 *  - editorial: pink, on tool cards ("Editors' pick", "New")
 *  - accent:    purple, on pricing tiers ("Most popular")
 *  - trend:     purple, non-uppercase, on trending cards ("+142%")
 */

interface BadgeProps {
  children: ReactNode
  variant?: 'editorial' | 'accent' | 'trend'
}

const VARIANTS: Record<NonNullable<BadgeProps['variant']>, string> = {
  editorial:
    'rounded-tag bg-pink-bg px-[10px] py-[5px] text-[11px] font-bold tracking-[0.05em] uppercase whitespace-nowrap text-pink',
  accent:
    'rounded-tag bg-accent-wash-strong px-[10px] py-[5px] text-[11.5px] font-bold tracking-[0.05em] uppercase text-accent',
  trend:
    'rounded-tag bg-accent-wash-strong px-[9px] py-[5px] text-[12px] font-semibold text-accent',
}

export default function Badge({ children, variant = 'editorial' }: BadgeProps) {
  return <span className={VARIANTS[variant]}>{children}</span>
}
