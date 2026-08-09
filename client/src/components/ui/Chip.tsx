import type { ReactNode } from 'react'

/*
 * Small pill / tag.
 *  - tag:    static label inside a tool card (rounded 8px, no border)
 *  - filter: clickable pricing-model chip on the Browse sidebar
 */

interface ChipProps {
  children: ReactNode
  variant?: 'tag' | 'filter' | 'popular'
  active?: boolean
  onClick?: () => void
}

export default function Chip({ children, variant = 'tag', active = false, onClick }: ChipProps) {
  if (variant === 'tag') {
    return (
      <span className="rounded-tag bg-white/[0.06] px-[10px] py-[5px] text-[12px] text-muted-soft">
        {children}
      </span>
    )
  }

  /* Popular-search suggestions under the hero search bar. */
  if (variant === 'popular') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer rounded-pill border border-hairline bg-white/[0.028] px-3 py-[6px] text-[12.5px] text-[#A7A1BD] transition-[transform,border-color,color,background-color] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[2px] hover:border-[rgba(178,150,255,0.38)] hover:bg-[rgba(178,150,255,0.09)] hover:text-[#EFEAFF]"
      >
        {children}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-pill border px-3 py-[7px] text-[13px] transition-[border-color,color,background-color] duration-200 ${
        active
          ? 'border-accent-line bg-accent-wash text-accent'
          : 'border-white/[0.09] text-muted-soft hover:border-accent-line hover:bg-accent-wash hover:text-accent'
      }`}
    >
      {children}
    </button>
  )
}
