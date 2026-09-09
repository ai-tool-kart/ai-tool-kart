import type { SavingsDimension } from '@/types/workSavings'

/*
 * The marks "See What AI Can Save You" draws, traced from the final design
 * handoff's inline SVG paths.
 *
 * Kept local to this section rather than promoted to components/ui: no other
 * surface draws a clock, a currency glyph or a bolt, and a shared icon module
 * that exists to serve one caller is indirection without a second reader.
 */

interface IconProps {
  className?: string
}

/**
 * The two-path stroke icons the comparison table puts beside each dimension.
 *
 * Keyed by the dimension itself: there are exactly three, each has exactly one
 * mark, and a separate icon field on every row would only ever be a second place
 * for the two to disagree.
 */
const ROW_PATHS: Record<SavingsDimension, readonly [string, string]> = {
  Time: ['M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6Z', 'M12 8.4V12l2.8 1.8'],
  Cost: [
    'M12 4.5v15',
    'M15.6 8.2c0-1.5-1.6-2.4-3.6-2.4s-3.6.9-3.6 2.4 1.6 2.2 3.6 2.6 3.6 1 3.6 2.6-1.6 2.4-3.6 2.4-3.6-.9-3.6-2.4',
  ],
  Effort: ['M12 4.2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M4.6 20.4c0-3.6 3.3-6 7.4-6s7.4 2.4 7.4 6'],
}

/** Clock, currency or person — the dimension marks in the comparison table. */
export function SavingsRowIconGlyph({
  dimension,
  className,
}: IconProps & { dimension: SavingsDimension }) {
  const [d, d2] = ROW_PATHS[dimension]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
      <path d={d2} />
    </svg>
  )
}

/** The ticked circle on the value strip. */
export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.4 12.2 2.5 2.5 4.7-5" />
    </svg>
  )
}

/** The person glyph inside the role field. */
export function PersonIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 4.4a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8ZM4.8 20.2c0-3.5 3.2-5.8 7.2-5.8s7.2 2.3 7.2 5.8" />
    </svg>
  )
}

/** The chevron on the right of the role field. */
export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </svg>
  )
}

/** The circled "i" in the idle panel. */
export function InfoIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.2M12 7.9v.1" />
    </svg>
  )
}

/** The bolt beside "Effort reduced" in the role result. */
export function BoltIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M13.4 3.2 5.6 13.4h5l-1.2 7.4 8-10.4h-5l1-7.2Z" />
    </svg>
  )
}
