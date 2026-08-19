import type { ReactNode } from 'react'
import BlogCard from '@/components/blog/BlogCard'
import type { BlogPost } from '@/types/blog'

/*
 * Responsive article grid.
 *
 * Source: AI Tool Kart Site.dc.html — `repeat(auto-fit, minmax(280px, 1fr))`,
 * 16px gap. `auto-fill` is used instead of `auto-fit` so a single remaining
 * article keeps card proportions rather than stretching across the full row,
 * and the track floor is `min(280px, 100%)` so it cannot overflow a 320px
 * viewport once the 32px gutters are taken.
 */

interface BlogGridProps {
  posts?: BlogPost[]
  showDates?: boolean
  /** Skeleton tiles render through the same track definition. */
  children?: ReactNode
}

export default function BlogGrid({ posts, showDates = false, children }: BlogGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-4">
      {children ?? posts?.map((post) => (
        <BlogCard key={post.id} post={post} showDate={showDates} />
      ))}
    </div>
  )
}
