import type { ReactNode } from 'react'

/*
 * Glass card with a pointer-tracked highlight.
 *
 * The dot element carries data-glow-dot and starts at opacity 0; the hook that
 * moves and reveals it on pointer movement lands in Phase 9. The card carries
 * data-glow so that hook can find it.
 *
 * Glow geometry differs per card in the design (360px on featured, 320px on
 * browse results, 300px on category tiles), so it is passed in rather than
 * hard-coded.
 */

interface GlowCardProps {
  children: ReactNode
  /** Diameter of the highlight in px. */
  glowSize?: number
  /** Alpha at the centre and at the 45% stop. */
  glowFrom?: number
  glowMid?: number
  onClick?: () => void
  /** Scroll-reveal anchor read by the Phase 9 hook. */
  reveal?: string
  className?: string
}

export default function GlowCard({
  children,
  glowSize = 320,
  glowFrom = 0.216,
  glowMid = 0.072,
  onClick,
  reveal,
  className = '',
}: GlowCardProps) {
  const interactive = Boolean(onClick)

  return (
    <div
      data-glow="1"
      data-reveal={reveal}
      onClick={onClick}
      className={`relative overflow-hidden ${interactive ? 'cursor-pointer' : ''} ${className}`}
    >
      <div
        data-glow-dot="1"
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 rounded-full opacity-0 transition-opacity duration-[450ms] ease-out"
        style={{
          width: `${glowSize}px`,
          height: `${glowSize}px`,
          margin: `-${glowSize / 2}px 0 0 -${glowSize / 2}px`,
          background: `radial-gradient(circle, rgba(202,168,255,${glowFrom}) 0%, rgba(202,168,255,${glowMid}) 45%, rgba(202,168,255,0) 70%)`,
        }}
      />
      {children}
    </div>
  )
}
