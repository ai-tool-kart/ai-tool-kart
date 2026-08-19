import { Link } from 'react-router-dom'
import BlogCategoryPill from '@/components/blog/BlogCategoryPill'
import BlogMedia from '@/components/blog/BlogMedia'
import type { BlogPost } from '@/types/blog'
import { formatPostMeta } from '@/utils/blog'

/*
 * Standard article card.
 *
 * Source: AI Tool Kart Site.dc.html, the `sc-for blogPosts` card — r22, glass
 * gradient fill, 16/10 image, category pill + reading time, title, excerpt.
 *
 * Rendered as a <Link> so it is reachable by keyboard with a real focus ring,
 * rather than the design's onClick-on-a-div.
 */

interface BlogCardProps {
  post: BlogPost
  /** Adds the published month to the metadata line. Off by default, as in the design. */
  showDate?: boolean
}

export default function BlogCard({ post, showDate = false }: BlogCardProps) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      data-reveal="stagger"
      className="relative flex flex-col gap-[14px] overflow-hidden rounded-card-lg border border-hairline bg-[linear-gradient(180deg,rgba(255,255,255,0.052)_0%,rgba(255,255,255,0.016)_100%)] p-4 shadow-[inset_0_1px_0_rgba(224,212,255,0.15),0_1px_2px_rgba(0,0,0,0.4),0_20px_38px_-30px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[6px] hover:border-white/[0.17] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.082)_0%,rgba(255,255,255,0.024)_100%)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.28),0_2px_6px_rgba(0,0,0,0.45),0_30px_54px_-28px_rgba(124,88,244,0.75)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:translate-y-[-2px] active:scale-[0.99]"
    >
      <BlogMedia
        src={post.featuredImage}
        alt={post.featuredImageAlt}
        className="aspect-[16/10] w-full"
      />

      <div className="flex flex-wrap items-center gap-[9px]">
        <BlogCategoryPill category={post.category} />
        <span className="text-[12px] text-subtle-dim">{formatPostMeta(post, showDate)}</span>
      </div>

      <h3 className="text-[17px] leading-[1.3] font-semibold tracking-[-0.02em] text-pretty text-ink">
        {post.title}
      </h3>

      {post.excerpt && (
        <p className="line-clamp-3 text-[13.5px] leading-[1.55] text-pretty text-subtle">
          {post.excerpt}
        </p>
      )}
    </Link>
  )
}
