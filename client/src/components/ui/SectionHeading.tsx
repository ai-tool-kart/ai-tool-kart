import type { ReactNode } from 'react'

/*
 * Eyebrow + title pair that opens nearly every section in the design, with an
 * optional trailing action on the same baseline.
 */

interface SectionHeadingProps {
  eyebrow: string
  title: string
  /** Renders as <h1> on sub-page headers, <h2> in Home sections. */
  as?: 'h1' | 'h2'
  /** Title size: 52px (page), 40px (section), 36px (panel heading). */
  size?: 'page' | 'section' | 'panel'
  /** Optional right-aligned action, e.g. "See the full catalog →". */
  action?: ReactNode
  center?: boolean
  balance?: boolean
}

const TITLE_SIZES = {
  page: 'text-[52px] tracking-[-0.04em]',
  section: 'text-[40px] tracking-[-0.032em]',
  panel: 'text-[36px] tracking-[-0.032em]',
} as const

export default function SectionHeading({
  eyebrow,
  title,
  as: Tag = 'h2',
  size,
  action,
  center = false,
  balance = false,
}: SectionHeadingProps) {
  const titleSize = TITLE_SIZES[size ?? (Tag === 'h1' ? 'page' : 'section')]
  const heading = (
    <div className={center ? 'text-center' : undefined}>
      <div
        data-reveal="0"
        className="text-[11.5px] tracking-[0.2em] uppercase text-accent"
      >
        {eyebrow}
      </div>
      <Tag
        data-reveal="0.06"
        className={`mt-3 font-bold text-ink ${titleSize} ${balance ? 'text-balance' : ''}`}
      >
        {title}
      </Tag>
    </div>
  )

  if (!action) return heading

  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      {heading}
      {action}
    </div>
  )
}
