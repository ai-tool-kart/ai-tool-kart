/*
 * The two marks the editors' desk draws, traced from the final design handoff.
 *
 * Kept local to this section rather than promoted to components/ui: the Browse
 * card already inlines its own star and this milestone must not touch Browse, so
 * a shared component would leave two copies anyway. It moves up the day Browse
 * is next opened for another reason.
 */

interface IconProps {
  className?: string
}

/** The filled star beside a rating. Same path the Browse card uses. */
export function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="m12 3.6 2.6 5.4 5.9.82-4.3 4.16 1.03 5.86L12 17.1 6.77 19.84 7.8 13.98 3.5 9.82l5.9-.82L12 3.6Z" />
    </svg>
  )
}

/** The outlined star in the "Today's Pick" header tile. */
export function PickStarIcon({ className }: IconProps) {
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
      <path d="m12 3.4 2.7 5.6 6.1.85-4.45 4.3 1.07 6.05L12 17.35 6.58 20.2l1.07-6.05L3.2 9.85l6.1-.85L12 3.4Z" />
    </svg>
  )
}

/** The empty media slot's glyph — the handoff's `image-slot` empty state. */
export function ImageSlotIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}
