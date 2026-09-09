import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import BlogMedia from '@/components/blog/BlogMedia'
import { warmToneForIndex } from '@/components/blogInsights/insightTone'
import type { BlogPost } from '@/types/blog'
import { blogCategoryLabel, formatPostMeta } from '@/utils/blog'

/*
 * A secondary story in Home's Blog & Insights section.
 *
 * Source: AI Tool Kart Site.dc.html, the `sc-for insightPosts` card — r22, warm
 * glass fill, a 16:9 image with a fade along its lower edge, then the category
 * pill and reading time, the title, the excerpt and "Read →".
 *
 * The three CSS custom properties are the same contract every other card in the
 * app uses: `--acc` colours the pill, `--t1` fills it and feeds the spotlight,
 * `--glow` tints the hover shadow. See components/blogInsights/insightTone.ts.
 *
 * Metadata is the design's: category and reading time, no date. The featured
 * card above carries the month, which is where a reader looks to judge how
 * current the section is; repeating it on every tile is noise the handoff
 * deliberately does not have.
 */

/** The custom properties the design drives its per-card colours through. */
interface ToneVars extends CSSProperties {
  '--acc': string
  '--glow': string
  '--t1': string
}

interface InsightCardProps {
  post: BlogPost
  /** Position in the row — picks the warm tone, exactly as the design does. */
  index: number
}

export default function InsightCard({ post, index }: InsightCardProps) {
  const tone = warmToneForIndex(index)

  const style: ToneVars = {
    '--acc': tone.accent,
    '--glow': tone.glow,
    '--t1': tone.tint,
  }

  return (
    <Link
      to={`/blog/${post.slug}`}
      data-reveal="stagger"
      data-spot="1"
      style={style}
      className="group relative flex flex-col overflow-hidden rounded-card-lg border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,250,242,0.055)_0%,rgba(255,255,255,0.016)_100%)] shadow-[inset_0_1px_0_rgba(244,232,210,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_26px_48px_-34px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-[rgba(229,196,140,0.32)] hover:bg-[linear-gradient(180deg,rgba(255,250,242,0.085)_0%,rgba(255,255,255,0.024)_100%)] hover:shadow-[inset_0_1px_0_rgba(250,240,222,0.3),0_2px_6px_rgba(0,0,0,0.45),0_34px_60px_-30px_var(--glow)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E6D2AC] active:translate-y-[-2px] active:scale-[0.99]"
    >
      {/* Geometry and fade come from [data-spot-layer] in styles/index.css; only
          the fill is overridden, so the spotlight carries the card's own tone. */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="z-[3] [background:radial-gradient(200px_circle_at_var(--mx,50%)_var(--my,50%),var(--t1)_0%,rgba(255,255,255,0.03)_36%,transparent_64%)]"
      />

      <BlogMedia
        src={post.featuredImage}
        alt={post.featuredImageAlt}
        radius="none"
        frame={false}
        tone="warm"
        className="aspect-[16/9] w-full"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 left-0 h-[52px] bg-[linear-gradient(to_top,rgba(18,12,8,0.72),transparent)]"
        />
      </BlogMedia>

      <div className="relative flex flex-col gap-[11px] px-5 pt-[18px] pb-5">
        <div className="flex flex-wrap items-center gap-[11px]">
          <span className="rounded-pill border border-white/[0.1] bg-[var(--t1)] px-[10px] py-1 text-[9.5px] font-bold tracking-[0.14em] text-[var(--acc)] uppercase">
            {blogCategoryLabel(post.category)}
          </span>
          <span className="text-[12px] text-[#6F6759]">{formatPostMeta(post)}</span>
        </div>

        <h3 className="line-clamp-2 text-[17px] leading-[1.32] font-semibold tracking-[-0.016em] text-pretty text-[#F4EFE5]">
          {post.title}
        </h3>

        {post.excerpt && (
          <p className="line-clamp-3 text-[13px] leading-[1.6] text-pretty text-[#8A8274]">
            {post.excerpt}
          </p>
        )}

        <span className="mt-auto inline-flex items-center gap-[7px] pt-[2px] text-[13px] font-medium text-[#C2B39A]">
          Read
          <span
            aria-hidden="true"
            className="text-[14px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>
    </Link>
  )
}
