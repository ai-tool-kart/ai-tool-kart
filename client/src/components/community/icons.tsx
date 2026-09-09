import type { CommunityPlatform } from '@/types/community'

/*
 * The Community section's drawings.
 *
 * Every path string is copied verbatim from the final design handoff
 * (`data-screen-label="Community"`): the `d` / `d2` pairs on each `socialLinks`
 * entry, the filled Discord mark on the feature card, the people glyph on the
 * proof row, and the small arrow inside each CTA pill. These are the design's
 * own drawings rather than lookalikes from an icon set.
 *
 * Every icon inherits `currentColor` and takes its size from `className`.
 *
 * Kept separate from components/layout/Footer.tsx's icon map on purpose: the
 * footer draws Instagram as a rounded rect plus two circles (an icon-only
 * square at 16px, where a single stroked path would mush), while this section
 * draws the handoff's one-path version at 19px. Same brand, two sizes, two
 * drawings — merging them would make one of the two look wrong.
 */

/** The design draws every social glyph on a 24-grid at 1.8 stroke. */
const STROKE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** The `d` / `d2` pair the handoff carries per platform. `d2` is '' for X. */
const SOCIAL_PATHS: Record<CommunityPlatform, readonly [string, string]> = {
  discord: ['', ''],
  x: ['M17.5 3h3.1l-6.8 7.8L21.5 21h-5.6l-4.4-5.7L6.4 21H3.3l7.1-8.1L2.9 3h5.7l4.1 5.4L17.5 3Z', ''],
  instagram: [
    'M8.5 3.5h7a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5Z',
    'M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z',
  ],
  youtube: [
    'M3.5 8.2a2.6 2.6 0 0 1 2.3-2.5C7.9 5.5 9.9 5.4 12 5.4s4.1.1 6.2.3a2.6 2.6 0 0 1 2.3 2.5c.1 1.2.2 2.5.2 3.8s-.1 2.6-.2 3.8a2.6 2.6 0 0 1-2.3 2.5c-2.1.2-4.1.3-6.2.3s-4.1-.1-6.2-.3a2.6 2.6 0 0 1-2.3-2.5c-.1-1.2-.2-2.5-.2-3.8s.1-2.6.2-3.8Z',
    'm10.4 9.5 4.4 2.5-4.4 2.5V9.5Z',
  ],
  linkedin: [
    'M4.6 9.4h2.8V20H4.6V9.4Zm1.4-5a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z',
    'M10.2 9.4H13v1.5a3.6 3.6 0 0 1 3.2-1.7c2.4 0 3.6 1.5 3.6 4.3V20h-2.8v-5.9c0-1.5-.6-2.3-1.8-2.3-1.3 0-2.2.9-2.2 2.4V20h-2.8V9.4Z',
  ],
}

/** One platform's glyph. Decorative — the card's text carries the name. */
export function SocialIcon({
  platform,
  className = '',
}: {
  platform: CommunityPlatform
  className?: string
}) {
  const [d, d2] = SOCIAL_PATHS[platform]
  return (
    <svg {...STROKE} className={className}>
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  )
}

/** The filled Discord mark on the feature card. */
export function DiscordIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M19.3 5.6A16 16 0 0 0 15.3 4.4l-.3.7a12 12 0 0 1 3.4 1.2 11.4 11.4 0 0 0-9-.9c-.5.2-1 .4-1.4.6a12 12 0 0 1 3.4-1.2l-.3-.7A16 16 0 0 0 4.7 5.6C2.6 8.9 2 12.4 2.3 15.9a15.7 15.7 0 0 0 4.8 2.4l.6-1a10.4 10.4 0 0 1-1.7-.8l.4-.3a11.6 11.6 0 0 0 9.9 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a15.7 15.7 0 0 0 4.8-2.4c.4-3.9-.6-7.4-2.6-10.3ZM9 13.9c-.9 0-1.6-.8-1.6-1.8S8.1 10.3 9 10.3s1.6.8 1.6 1.8-.7 1.8-1.6 1.8Zm6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Z" />
    </svg>
  )
}

/** Two figures — the proof row's glyph. Drawn at 1.7 stroke in the handoff. */
export function MembersIcon({ className = '' }: { className?: string }) {
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
      <circle cx="9" cy="8.6" r="3.4" />
      <path d="M2.8 19.2c0-3.1 2.8-5.2 6.2-5.2s6.2 2.1 6.2 5.2" />
      <path d="M16.4 5.6a3.2 3.2 0 0 1 0 6.1" />
      <path d="M18.2 14.6c2 .7 3.4 2.3 3.4 4.6" />
    </svg>
  )
}

/** The 12px arrow inside a social card's CTA pill. */
export function CtaArrowIcon({ className = '' }: { className?: string }) {
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
      <path d="M5 12h13" />
      <path d="m12.5 6 6 6-6 6" />
    </svg>
  )
}
