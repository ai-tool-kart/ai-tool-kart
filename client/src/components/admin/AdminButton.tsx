import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/*
 * The admin console's buttons. Square-ish, compact and flat — the public
 * site's glowing pill CTAs belong to the product, not the console.
 *
 *   primary    the one main action on a screen (solid, light)
 *   secondary  neutral actions (bordered)
 *   danger     refusals and removals (red outline)
 *   dangerSolid  the confirm button of a destructive dialog
 *   ghost      low-emphasis text actions
 */

export type AdminButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerSolid' | 'ghost'

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[6px] text-[13px] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b49bff]'

const VARIANTS: Record<AdminButtonVariant, string> = {
  primary: 'bg-[#ece9f6] px-3.5 py-[8px] text-[#0b0b0f] hover:bg-white disabled:hover:bg-[#ece9f6]',
  secondary:
    'border border-white/[0.12] bg-white/[0.02] px-3.5 py-[7px] text-ink hover:border-white/[0.24] hover:bg-white/[0.05] disabled:hover:border-white/[0.12] disabled:hover:bg-white/[0.02]',
  danger:
    'border border-[#f87171]/40 px-3.5 py-[7px] text-[#f9a3a3] hover:bg-[#f87171]/[0.1] disabled:hover:bg-transparent',
  dangerSolid: 'bg-[#dc3b3b] px-3.5 py-[8px] text-white hover:bg-[#e54b4b] disabled:hover:bg-[#dc3b3b]',
  ghost: 'px-2 py-[7px] text-[#a9a4bd] hover:text-ink',
}

interface AdminButtonProps {
  children: ReactNode
  variant?: AdminButtonVariant
  /** Renders a router link instead of a button. */
  to?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  /** Toggle state for a button in a choice group (aria-pressed). */
  pressed?: boolean
  className?: string
}

export default function AdminButton({ children, variant = 'secondary', to, onClick, type = 'button', disabled = false, pressed, className = '' }: AdminButtonProps) {
  const classes = `${BASE} ${VARIANTS[variant]} ${className}`
  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-pressed={pressed} className={classes}>
      {children}
    </button>
  )
}
