import type { ReactNode } from 'react'

/*
 * Featured-image frame used by every blog surface: both /blog card treatments,
 * the article header, and Home's Blog & Insights cards.
 *
 * Source: AI Tool Kart Site.dc.html, the <image-slot> wrappers inside the blog
 * section and inside `data-screen-label="Blog"` — a fixed box, the image cover-
 * fitted into it, and a soft wash when there is no image.
 *
 * A post with no featured media keeps the frame and shows a soft wash instead
 * of collapsing the layout, so a mixed grid stays on its baseline. The wash is
 * a *placeholder*, deliberately abstract: unrelated stock imagery would be a
 * claim about the article that nobody made.
 *
 * The box is always sized by the caller (an aspect ratio or a min-height in
 * `className`) and the image is absolutely positioned inside it, so the frame
 * occupies its final size before the image loads and nothing shifts when it
 * arrives.
 */

interface BlogMediaProps {
  src?: string
  alt: string
  /**
   * Corner radius: 15px on /blog cards, 18px on the featured card and article
   * header, none where the frame is clipped by a parent that owns the radius
   * (Home's Blog & Insights cards are full-bleed inside their card).
   */
  radius?: 'card' | 'featured' | 'none'
  /**
   * The hairline border and inset top highlight. On a full-bleed frame the
   * parent card already draws its own border, and a second one shows as a seam.
   */
  frame?: boolean
  /** Which wash stands in for a missing image — violet on /blog, warm on Home. */
  tone?: 'violet' | 'warm'
  /** Above-the-fold media (featured card, article header) skips lazy loading. */
  priority?: boolean
  /** Scrims and gradients painted over the media, as in the Home section. */
  children?: ReactNode
  className?: string
}

const RADII = {
  card: 'rounded-[15px]',
  featured: 'rounded-card',
  none: '',
} as const

const FALLBACK_WASH = {
  violet:
    'bg-[radial-gradient(ellipse_70%_60%_at_30%_20%,rgba(124,88,244,0.22)_0%,rgba(124,88,244,0)_70%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.01)_100%)]',
  warm: 'bg-[radial-gradient(ellipse_70%_60%_at_30%_20%,rgba(214,164,84,0.2)_0%,rgba(214,164,84,0)_70%),linear-gradient(180deg,rgba(255,250,242,0.05)_0%,rgba(255,255,255,0.012)_100%)]',
} as const

export default function BlogMedia({
  src,
  alt,
  radius = 'card',
  frame = true,
  tone = 'violet',
  priority = false,
  children,
  className = '',
}: BlogMediaProps) {
  const framing = frame
    ? 'border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
    : ''

  return (
    <div
      className={`relative overflow-hidden bg-white/[0.03] ${RADII[radius]} ${framing} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div aria-hidden="true" className={`absolute inset-0 ${FALLBACK_WASH[tone]}`} />
      )}
      {children}
    </div>
  )
}
