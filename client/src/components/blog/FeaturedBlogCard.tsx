import { Link } from 'react-router-dom'
import BlogCategoryPill from '@/components/blog/BlogCategoryPill'
import BlogMedia from '@/components/blog/BlogMedia'
import type { BlogPost } from '@/types/blog'
import { formatPostMeta } from '@/utils/blog'

/*
 * The lead article on /blog.
 *
 * Source: AI Tool Kart Site.dc.html, the [data-spot] panel inside `sc-if isBlog`
 * — r26, violet-washed gradient, 16/10 image beside the copy, "Read the story →".
 *
 * The whole card is one <Link>, so the click target and the keyboard target are
 * the same element; the design's pointer-tracked spotlight is dropped because
 * the repo has no pointer hook yet, and the hover lift alone carries it.
 *
 * The two columns are flex-basis pairs (360px / 340px) rather than a media
 * query: below ~800px they wrap to a stacked layout on their own.
 */

interface FeaturedBlogCardProps {
  post: BlogPost
}

export default function FeaturedBlogCard({ post }: FeaturedBlogCardProps) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      data-reveal="0"
      className="group relative flex flex-wrap gap-[26px] overflow-hidden rounded-[26px] border border-hairline bg-[linear-gradient(168deg,rgba(124,88,244,0.12)_0%,rgba(255,255,255,0.045)_36%,rgba(255,255,255,0.015)_100%)] p-[22px] shadow-[inset_0_1px_0_rgba(232,222,255,0.18),0_2px_6px_rgba(0,0,0,0.4),0_40px_76px_-50px_rgba(72,34,180,0.6)] transition-[transform,border-color,box-shadow] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:border-[rgba(178,150,255,0.34)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.28),0_2px_6px_rgba(0,0,0,0.45),0_48px_86px_-48px_rgba(124,88,244,0.8)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <BlogMedia
        src={post.featuredImage}
        alt={post.featuredImageAlt}
        radius="featured"
        priority
        className="aspect-[16/10] min-w-0 flex-[1_1_360px]"
      />

      <div className="flex min-w-0 flex-[1_1_340px] flex-col justify-center gap-[14px] py-[6px] pr-[6px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <BlogCategoryPill category={post.category} variant="featured" />
          <span className="text-[12.5px] text-subtle-dim">{formatPostMeta(post, true)}</span>
        </div>

        <h2 className="text-[clamp(24px,2.4vw,34px)] leading-[1.14] font-bold tracking-[-0.03em] text-pretty text-ink-soft">
          {post.title}
        </h2>

        {post.excerpt && (
          <p className="max-w-[46ch] text-[15px] leading-[1.65] text-pretty text-body">
            {post.excerpt}
          </p>
        )}

        <span className="mt-1 inline-flex items-center gap-2 text-[14.5px] font-semibold text-link">
          Read the story
          <span
            aria-hidden="true"
            className="text-[15px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>
    </Link>
  )
}
