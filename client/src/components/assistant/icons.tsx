/*
 * Every icon the assistant stage draws, traced from the final design's inline
 * SVG (AI Tool Kart Site.dc.html, the hero assistant panel and the "Build Your
 * AI Setup" card). Path data is copied verbatim — these are the design's
 * drawings, not lookalikes from an icon set.
 *
 * All of them inherit `currentColor` and take their size from a `className`, so
 * a caller sets colour and size the same way it does for text.
 */

interface IconProps {
  className?: string
}

/** Shared attributes: the design draws every icon on a 24-grid at 1.7 stroke. */
const STROKE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** The assistant's mark — panel header and every assistant bubble. */
export function BotIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <rect x="3.6" y="7.5" width="16.8" height="12" rx="3" />
      <path d="M12 3.4v4.1" />
      <path d="M9 12.6v1.8" />
      <path d="M15 12.6v1.8" />
    </svg>
  )
}

/** The three-node graph in the plan panel's empty state. */
export function PlanGraphIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} strokeWidth={1.6} className={className}>
      <circle cx="6" cy="7" r="2.4" />
      <circle cx="18" cy="6.6" r="2.2" />
      <circle cx="12" cy="17.4" r="2.6" />
      <path d="M7.6 8.8 10.7 15M16.6 8.5 13.4 15.2M8.3 6.6h7.5" />
    </svg>
  )
}

/** Composer submit — an upward arrow, not a paper plane. */
export function SendIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} strokeWidth={2} className={className}>
      <path d="M12 19V5.5" />
      <path d="m5.6 11.9 6.4-6.4 6.4 6.4" />
    </svg>
  )
}

/** Dropdown chevron on the setup pickers. */
export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} strokeWidth={2} className={className}>
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </svg>
  )
}

/** "Who are you" — the role picker. */
export function RoleIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M12 4.4a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8ZM4.8 20.2c0-3.5 3.2-5.8 7.2-5.8s7.2 2.3 7.2 5.8" />
    </svg>
  )
}

/** "What are you doing" — the goal picker. */
export function GoalIcon({ className }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8ZM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6" />
    </svg>
  )
}

/**
 * Renders one of the six plan-section marks.
 *
 * The path strings themselves live in data/assistant.ts with the labels they
 * belong to — they are content, and keeping them out of here leaves this module
 * exporting components only.
 */
export function PlanSectionIcon({ path, className }: IconProps & { path: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d={path} />
    </svg>
  )
}
