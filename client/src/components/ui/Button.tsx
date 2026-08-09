import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/*
 * Pill button.
 *
 * Variants map to the three button treatments in the handoff:
 *  - gradient: the purple CTA (nav, pricing tiers, empty state)
 *  - outline:  bordered translucent pill ("Browse all 2,412", "Reset")
 *  - ghost:    smaller bordered pill used inside cards ("Compare")
 */

type ButtonVariant = 'gradient' | 'outline' | 'ghost'

interface ButtonProps {
  children: ReactNode
  variant?: ButtonVariant
  /** Renders a react-router Link instead of a button. */
  to?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  /** Adds the magnetic-hover anchor read by the Phase 9 hook. */
  magnetic?: boolean
  fullWidth?: boolean
  className?: string
}

const VARIANTS: Record<ButtonVariant, string> = {
  gradient:
    'rounded-pill border border-white/[0.16] bg-[image:var(--gradient-cta)] px-[18px] py-[10px] text-[14px] font-semibold text-white shadow-button transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:text-white hover:shadow-button-hover',
  outline:
    'rounded-pill border border-white/[0.09] bg-white/[0.035] px-5 py-[11px] text-[14.5px] font-medium text-ink whitespace-nowrap transition-[background-color,border-color,transform] duration-200 hover:-translate-y-[2px] hover:border-accent-line hover:bg-accent-wash hover:text-ink',
  ghost:
    'rounded-pill border border-white/[0.09] px-[15px] py-2 text-[13px] font-semibold text-ink transition-[background-color,border-color,color] duration-200 hover:border-accent-line hover:bg-accent-wash-strong hover:text-accent',
}

export default function Button({
  children,
  variant = 'gradient',
  to,
  onClick,
  type = 'button',
  magnetic = false,
  fullWidth = false,
  className = '',
}: ButtonProps) {
  const classes = [
    'inline-block text-center cursor-pointer',
    VARIANTS[variant],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (to) {
    return (
      <Link to={to} data-magnet={magnetic ? '1' : undefined} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button
      type={type}
      onClick={onClick}
      data-magnet={magnetic ? '1' : undefined}
      className={classes}
    >
      {children}
    </button>
  )
}
