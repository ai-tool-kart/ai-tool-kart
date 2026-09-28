/*
 * Shared surfaces and icons for the workflow guide page.
 *
 * Two surface tiers, on purpose: editorial prose sits on the canvas with no
 * card at all, and the interactive workflow sits in WINDOW — a deeper glass
 * with the violet top rim — so a reader can tell "read this" from "do this"
 * at a glance. PANEL is the quieter card between the two, for the short
 * checklists (learn / before you start / tips).
 */

/** The interactive window — the stepper and the hero's snapshot. */
export const WINDOW =
  'relative overflow-hidden rounded-panel border border-white/[0.09] bg-[linear-gradient(180deg,rgba(24,19,44,0.82),rgba(9,8,18,0.92))] shadow-[inset_0_1px_0_rgba(232,222,255,0.1),0_30px_80px_-40px_rgba(0,0,0,1),0_0_80px_-50px_rgba(132,92,255,0.6)] backdrop-blur-[14px]'

/** The violet hairline across a window's top edge. */
export function WindowRim() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 right-[14%] left-[14%] h-px bg-[linear-gradient(90deg,transparent,rgba(196,168,255,0.7),transparent)]"
    />
  )
}

/** The quieter card for checklists. */
export const PANEL =
  'rounded-card-md border border-hairline bg-[image:var(--gradient-spot)] shadow-spot'

/** Small uppercase label above a heading or inside a window. */
export const EYEBROW = 'text-[11.5px] font-medium tracking-[0.2em] text-accent uppercase'

/** Section H2 on the page. */
export const H2 = 'text-[clamp(22px,2.6vw,28px)] leading-[1.2] font-semibold tracking-[-0.03em] text-balance text-ink-bright'

/** Body prose. */
export const PROSE = 'text-[15.5px] leading-[1.7] tracking-[-0.006em] text-pretty text-[#B9B2CF]'

/** Anchor offset under the sticky header. */
export const ANCHOR = 'scroll-mt-[176px]'

interface IconProps {
  className?: string
}

const STROKE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} strokeWidth={2.2} className={className}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  )
}

export function ArrowIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function ExternalIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M8 16 16 8M9.5 8H16v6.5" />
    </svg>
  )
}

export function BulbIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
    </svg>
  )
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.9M12 16.2h.01" />
    </svg>
  )
}
