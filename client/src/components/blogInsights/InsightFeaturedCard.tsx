import { Link } from 'react-router-dom'
import BlogMedia from '@/components/blog/BlogMedia'
import type { BlogPost } from '@/types/blog'
import { formatPostMeta } from '@/utils/blog'

/*
 * The lead story in Home's Blog & Insights section.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Blog"` — the r28 panel
 * under the heading: a two-track grid with no gap, the media bleeding into the
 * card's left half behind a warm scrim, the copy centred in the right half.
 *
 * ── What "featured" means here ───────────────────────────────────────────────
 *
 * The NEWEST published post, and nothing else. The badge is layout language for
 * "this is the lead card", not a flag read from or written to WordPress — the
 * CMS has no editorial featured field, and inventing one in homepage config
 * would be a second place where the blog's ordering is decided. If a real
 * featured field is ever added to the CMS, the section above decides which post
 * arrives here and this card does not change.
 *
 * ── Layout ───────────────────────────────────────────────────────────────────
 *
 * The design's `repeat(auto-fit,minmax(300px,1fr))` is kept verbatim: it is a
 * media query written as a track, and below roughly 660px of card width the two
 * halves fold into one column with the media on top — exactly the mobile
 * behaviour the handoff shows, with no breakpoint to keep in sync.
 *
 * The whole card is one <Link>, so the click target and the keyboard target are
 * the same element rather than the prototype's onClick-on-a-div. It points at
 * the article, not at /blog: the design's `goBlog` is a prototype shortcut —
 * there is only one blog screen in the mock — and the section header's "View
 * all" is what actually carries a reader to the listing.
 */

interface InsightFeaturedCardProps {
  post: BlogPost
}

export default function InsightFeaturedCard({ post }: InsightFeaturedCardProps) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      data-reveal="0.06"
      data-spot="1"
      className="group relative grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] overflow-hidden rounded-panel-lg border border-[rgba(229,196,140,0.2)] bg-[linear-gradient(140deg,rgba(214,164,84,0.14)_0%,rgba(255,250,242,0.05)_38%,rgba(255,255,255,0.016)_100%)] shadow-[inset_0_1px_0_rgba(248,236,214,0.22),inset_0_-1px_0_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.45),0_40px_74px_-42px_rgba(150,110,50,0.5)] transition-[transform,border-color,box-shadow] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-[rgba(240,214,170,0.4)] hover:shadow-[inset_0_1px_0_rgba(252,242,224,0.32),0_2px_8px_rgba(0,0,0,0.5),0_52px_92px_-42px_rgba(178,132,58,0.7)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E6D2AC]"
    >
      {/* The warm spotlight, faded in by the shared pointer hook. Geometry and
          fade come from [data-spot-layer] in styles/index.css; only the fill is
          overridden, because this section is sand rather than violet. */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="z-[3] [background:radial-gradient(280px_circle_at_var(--mx,50%)_var(--my,50%),rgba(230,210,172,0.14)_0%,rgba(255,255,255,0.028)_38%,transparent_66%)]"
      />

      <BlogMedia
        src={post.featuredImage}
        alt={post.featuredImageAlt}
        radius="none"
        frame={false}
        tone="warm"
        priority
        className="min-h-[320px]"
      >
        {/* The scrim that carries the image into the copy half. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(40,24,8,0.18)_0%,rgba(20,12,4,0.1)_46%,rgba(12,8,16,0.55)_100%)]"
        />
      </BlogMedia>

      <div className="relative flex flex-col justify-center gap-4 px-[clamp(22px,3vw,38px)] py-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-pill border border-[rgba(229,196,140,0.4)] bg-[rgba(214,164,84,0.18)] px-[11px] py-[5px] text-[10px] font-bold tracking-[0.14em] text-[#F2DDB4] uppercase">
            Featured
          </span>
          <span className="text-[12.5px] text-[#8A8070]">{formatPostMeta(post, true)}</span>
        </div>

        {/*
         * <h3> under the section's <h2>. The handoff renders it as a plain div
         * at 28px; the level is added because this is the section's lead item
         * and a screen reader should be able to find it, and the type is the
         * design's unchanged.
         *
         * Clamped to three lines — the prototype has one fixed title and the CMS
         * does not, and an unclamped headline is the one thing that can push
         * the copy column taller than the 320px media beside it.
         */}
        <h3 className="line-clamp-3 text-[28px] leading-[1.2] font-bold tracking-[-0.028em] text-pretty text-[#FAF5EC]">
          {post.title}
        </h3>

        {post.excerpt && (
          <p className="line-clamp-3 max-w-[44ch] text-[14.5px] leading-[1.62] text-pretty text-[#9C9384]">
            {post.excerpt}
          </p>
        )}

        <span className="inline-flex items-center gap-[9px] text-[14px] font-semibold text-[#EBD3A6]">
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
