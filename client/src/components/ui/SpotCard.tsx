import type { ReactNode } from 'react'

/*
 * The final design's default card surface.
 *
 * Source: AI Tool Kart Site.dc.html — every `[data-spot]` element (stat tiles,
 * use-case cards, setup cards, story cards, launch and browse results, blog
 * cards, community links). They differ in padding, radius and content; they
 * share this shell, so the shell is the component and the rest is passed in.
 *
 * What it provides:
 *   - the base fill + hairline + shadow pair (--gradient-spot / --shadow-spot),
 *     with the design's lift-and-warm hover;
 *   - the `[data-spot-layer]` element the pointer spotlight paints into. The
 *     gradient itself lives in styles/index.css so it is declared once, and the
 *     hook in hooks/useDesignInteractions.ts is what moves it;
 *   - optionally the thin violet hairline the design draws across the top edge
 *     of its more prominent cards.
 *
 * It deliberately does NOT own layout — `className` sets padding, radius and
 * the flow of the contents, because those genuinely differ per card in the
 * source and forcing them through props would produce a worse component than
 * the twelve-line one it replaces.
 *
 * Superseding note: components/ui/GlowCard.tsx is the same idea built from the
 * FIRST design export, using [data-glow] and an inline dot element. Its only
 * consumer left is ToolCard; it goes when ToolCard moves onto this surface.
 */

interface SpotCardProps {
  children: ReactNode
  /** Padding, radius, and the card's internal layout. */
  className?: string
  /** Renders the violet hairline across the card's top edge. */
  topHairline?: boolean
  /** Entry-reveal delay in seconds, or "stagger" to derive it from sibling order. */
  reveal?: string
  onClick?: () => void
}

const BASE =
  'relative overflow-hidden border border-hairline bg-[image:var(--gradient-spot)] shadow-spot transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:border-white/[0.16] hover:bg-[image:var(--gradient-spot-hover)] hover:shadow-spot-hover'

export default function SpotCard({
  children,
  className = '',
  topHairline = false,
  reveal,
  onClick,
}: SpotCardProps) {
  const interactive = Boolean(onClick)

  return (
    <div
      data-spot="1"
      data-reveal={reveal}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={`${BASE} ${interactive ? 'cursor-pointer' : ''} ${className}`}
    >
      {topHairline && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-[20%] left-[20%] h-px bg-[linear-gradient(90deg,transparent,rgba(196,168,255,0.6),transparent)]"
        />
      )}
      <span data-spot-layer="1" aria-hidden="true" />
      {children}
    </div>
  )
}
