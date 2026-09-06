import type { ReactNode } from 'react'

/*
 * Small pill / tag.
 *  - tag:    static label inside a tool card (rounded 8px, no border)
 *  - filter: clickable pricing-model chip on the Browse sidebar
 */

interface ChipProps {
  children: ReactNode
  variant?: 'tag' | 'filter'
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
