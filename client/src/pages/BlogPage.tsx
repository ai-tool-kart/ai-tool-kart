import BlogEmptyState from '@/components/blog/BlogEmptyState'
import BlogErrorState from '@/components/blog/BlogErrorState'
import BlogGrid from '@/components/blog/BlogGrid'
import BlogSkeleton from '@/components/blog/BlogSkeleton'
import FeaturedBlogCard from '@/components/blog/FeaturedBlogCard'
import Section from '@/components/layout/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { useBlogPosts } from '@/hooks/useBlogPosts'

/*
 * /blog — the journal listing.
 *
 * Source: AI Tool Kart Site.dc.html, `sc-if isBlog` — JOURNAL eyebrow, "The Kart
 * Blog" page heading, intro copy, one lead article, then the card grid.
 *
 * Content is live WordPress: the newest published post becomes the featured
 * card and the rest fall into the grid, so what appears here is decided in the
 * CMS and nowhere else.
 */

const INTRO =
  "How we test, what we're seeing in the catalog, and the workflows our editors actually run."

export default function BlogPage() {
  const { data: posts, isLoading, error, retry } = useBlogPosts()

  const [featured, ...rest] = posts ?? []

  return (
    <Section spacing="sub" className="pb-4">
      <SectionHeading eyebrow="Journal" title="The Kart Blog" as="h1" />
      <p className="mt-4 max-w-[58ch] text-[16px] leading-[1.65] text-pretty text-body">
        {INTRO}
      </p>

      {isLoading && <BlogSkeleton />}

      {!isLoading && error && (
        <div className="mt-10">
          <BlogErrorState message={error} onRetry={retry} />
        </div>
      )}

      {!isLoading && !error && !featured && (
        <div className="mt-10">
          <BlogEmptyState />
        </div>
      )}

      {!isLoading && !error && featured && (
        <>
          <div className="mt-10">
            <FeaturedBlogCard post={featured} />
          </div>
          {rest.length > 0 && (
            <div className="mt-5">
              <BlogGrid posts={rest} />
            </div>
          )}
        </>
      )}
    </Section>
  )
}
