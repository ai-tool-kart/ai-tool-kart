/*
 * The two drawings on the "Add to AI Tool Kart" cards.
 *
 * Path data copied verbatim from the final design handoff's `ADD_OPTIONS`
 * array (`d` and `d2` on each entry), so these are the design's own drawings
 * rather than lookalikes. Same 24-grid and 1.7 stroke as the homepage rail's
 * set in components/popularWays/icons.tsx.
 *
 * Both inherit `currentColor` and take their size from `className`, and both
 * are decorative — the card's title carries the meaning.
 */

const STROKE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** An upward arrow on a stem — an upload. */
export function SubmitToolIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  )
}

/** Two nodes joined by an elbow — a handoff between steps. */
export function ShareSetupIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M6 4.5h4v4H6zM14 15.5h4v4h-4z" />
      <path d="M8 8.5v5a2 2 0 0 0 2 2h4" />
    </svg>
  )
}
