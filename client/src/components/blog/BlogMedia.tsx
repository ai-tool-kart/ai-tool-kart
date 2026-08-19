/*
 * Featured-image frame used by both blog card treatments and the article header.
 *
 * Source: AI Tool Kart Site.dc.html, the <image-slot> wrappers inside the blog
 * section — 16/10 box, hairline border, inset top highlight, clipped corners.
 *
 * A post with no featured media keeps the frame and shows a soft violet wash
 * instead of collapsing the layout, so a mixed grid stays on its baseline.
 */

interface BlogMediaProps {
  src?: string
  alt: string
  /** Corner radius: 15px on cards, 18px on the featured card and article header. */
  radius?: 'card' | 'featured'
  /** Above-the-fold media (featured card, article header) skips lazy loading. */
  priority?: boolean
  className?: string
}

export default function BlogMedia({
  src,
  alt,
  radius = 'card',
  priority = false,
  className = '',
}: BlogMediaProps) {
  const rounded = radius === 'featured' ? 'rounded-card' : 'rounded-[15px]'

  return (
    <div
      className={`relative overflow-hidden border border-white/[0.09] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] ${rounded} ${className}`}
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
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_30%_20%,rgba(124,88,244,0.22)_0%,rgba(124,88,244,0)_70%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.01)_100%)]"
        />
      )}
    </div>
  )
}
