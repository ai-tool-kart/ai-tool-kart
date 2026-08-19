import BlogGrid from '@/components/blog/BlogGrid'

/*
 * Loading placeholders for /blog — the featured panel plus a short grid, in the
 * same boxes the real content lands in, so nothing shifts when it arrives.
 *
 * Tailwind's `animate-pulse` is used rather than a bespoke keyframe; the global
 * prefers-reduced-motion override in styles/animations.css neutralises it.
 */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-[6px] bg-white/[0.06] ${className}`} />
}

export function FeaturedBlogSkeleton() {
  return (
    <div className="flex animate-pulse flex-wrap gap-[26px] overflow-hidden rounded-[26px] border border-hairline bg-white/[0.02] p-[22px]">
      <div className="aspect-[16/10] min-w-0 flex-[1_1_360px] rounded-card bg-white/[0.04]" />
      <div className="flex min-w-0 flex-[1_1_340px] flex-col justify-center gap-4 py-[6px]">
        <Bar className="h-[22px] w-[180px] rounded-pill" />
        <Bar className="h-[30px] w-full" />
        <Bar className="h-[30px] w-4/5" />
        <Bar className="h-[16px] w-full" />
        <Bar className="h-[16px] w-3/5" />
      </div>
    </div>
  )
}

function BlogCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-[14px] rounded-card-lg border border-hairline bg-white/[0.02] p-4">
      <div className="aspect-[16/10] w-full rounded-[15px] bg-white/[0.04]" />
      <Bar className="h-[18px] w-[150px] rounded-pill" />
      <Bar className="h-[18px] w-full" />
      <Bar className="h-[14px] w-4/5" />
    </div>
  )
}

interface BlogSkeletonProps {
  /** Number of grid tiles below the featured placeholder. */
  count?: number
}

export default function BlogSkeleton({ count = 6 }: BlogSkeletonProps) {
  return (
    <div aria-hidden="true">
      <div className="mt-10">
        <FeaturedBlogSkeleton />
      </div>
      <div className="mt-5">
        <BlogGrid>
          {Array.from({ length: count }, (_, i) => (
            <BlogCardSkeleton key={i} />
          ))}
        </BlogGrid>
      </div>
    </div>
  )
}
