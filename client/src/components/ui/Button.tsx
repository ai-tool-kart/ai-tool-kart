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

type ButtonVariant = 'gradient' | 'outline' | 'ghost' | 'light' | 'outlineLight'

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
  /* On-colour buttons used inside the compare teaser and CTA banner. */
  light:
    'rounded-pill bg-[linear-gradient(180deg,#FFFFFF,#EAE5FA)] px-7 py-[15px] text-[15px] font-semibold whitespace-nowrap text-[#241046] transition-[transform,box-shadow] duration-[250ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[3px] hover:text-[#241046] hover:shadow-[0_18px_34px_-16px_rgba(0,0,0,0.6)]',
  outlineLight:
    'rounded-pill border border-white/40 px-7 py-[15px] text-[15px] font-semibold whitespace-nowrap text-white transition-[background-color,transform] duration-[250ms] hover:-translate-y-[3px] hover:bg-white/[0.14] hover:text-white',
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
