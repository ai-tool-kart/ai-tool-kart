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
  /** Optional right-aligned action, e.g. "See the full catalog →". */
  action?: ReactNode
  center?: boolean
}

export default function SectionHeading({
  eyebrow,
  title,
  as: Tag = 'h2',
  action,
  center = false,
}: SectionHeadingProps) {
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
        className={`mt-3 font-bold text-ink ${
          Tag === 'h1'
            ? 'text-[52px] tracking-[-0.04em]'
            : 'text-[40px] tracking-[-0.032em]'
        }`}
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
