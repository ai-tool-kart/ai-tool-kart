import type { PopularWayIconName } from '@/types/popularWay'

/*
 * The six drawings on the "Popular Ways to Use AI" cards.
 *
 * Path data copied verbatim from the final design handoff's `USE_CASES` array
 * (`d` and `d2` on each entry), so these are the design's own drawings rather
 * than lookalikes. Same 24-grid and 1.7 stroke as the assistant's icon set in
 * components/assistant/icons.tsx; kept separate because that file is the
 * assistant stage's vocabulary and this is the homepage rail's.
 *
 * Each icon inherits `currentColor` and takes its size from `className`.
 */

/** The design draws every one of these on a 24-grid at 1.7 stroke. */
const STROKE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** The two path strings the handoff carries per icon. */
const PATHS: Record<PopularWayIconName, readonly [string, string]> = {
  /* A person above a shoulder line — an audience. */
  audience: [
    'M4 20.5c0-3.6 3.3-6 7.4-6s7.4 2.4 7.4 6',
    'M11.4 4.2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  ],
  /* A pen nib on a stroke. */
  compose: ['M4 20.4 5.4 15 16.3 4.1a2.2 2.2 0 0 1 3.1 3.1L8.5 18.1 4 20.4Z', 'm14.6 5.8 3.1 3.1'],
  /* A clock face and hands. */
  clock: ['M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6Z', 'M12 8.4V12l2.8 1.8'],
  /* A camera body with its lens barrel. */
  video: [
    'M2.8 7.8a2.6 2.6 0 0 1 2.6-2.6h8a2.6 2.6 0 0 1 2.6 2.6v8.4a2.6 2.6 0 0 1-2.6 2.6h-8a2.6 2.6 0 0 1-2.6-2.6V7.8Z',
    'm21.4 8.2-5.6 3.8 5.6 3.8V8.2Z',
  ],
  /* A graduation cap. */
  study: [
    'm2.4 8.6 9.6-4.4 9.6 4.4-9.6 4.4-9.6-4.4Z',
    'M6.4 10.6v5.2c0 1.7 2.5 3 5.6 3s5.6-1.3 5.6-3v-5.2',
  ],
  /* A rising line into an arrowhead. */
  trend: ['m3 16.6 5.6-5.6 4 4L21 6.6', 'M15.2 6.6H21v5.8'],
}

interface PopularWayIconProps {
  name: PopularWayIconName
  className?: string
}

export default function PopularWayIcon({ name, className }: PopularWayIconProps) {
  const [d, d2] = PATHS[name]
  return (
    <svg {...STROKE} className={className}>
      <path d={d} />
      <path d={d2} />
    </svg>
  )
}
