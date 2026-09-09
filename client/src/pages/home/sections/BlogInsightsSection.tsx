import { Link } from 'react-router-dom'
import BlogInsightsSkeleton, {
  InsightFeaturedSkeleton,
} from '@/components/blogInsights/BlogInsightsSkeleton'
import InsightCard from '@/components/blogInsights/InsightCard'
import InsightFeaturedCard from '@/components/blogInsights/InsightFeaturedCard'
import { useLatestBlogPosts } from '@/hooks/useBlogPosts'

/*
 * "Blog & Insights" — the newest three stories from the journal.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Blog"`. It follows
 * Savings in the final design, and does so here. A warm brown band — the third
 * of the page's warm passages, and the one that reads as editorial rather than
 * catalogue: sand eyebrow, gold accents, no violet anywhere in it.
 *
 * ── This is a window onto /blog, not a second blog ───────────────────────────
 *
 * Nothing about these three posts is decided on the homepage. There is no list
 * of slugs, no featured flag, no copy, and no image registry: the section asks
 * the existing blog service for the latest published posts and renders whatever
 * WordPress returns. Publish a post and it appears here on the next load;
 * unpublish it and it leaves. The Blog page remains the canonical destination
 * and every card links into it.
 *
 * "Featured" is the LEAD SLOT, not a CMS field. The newest post fills the large
 * card because it is newest; the badge is layout language for that, and nothing
 * is written back to WordPress to express it. If the CMS ever grows a real
 * editorial featured flag, it belongs in the service's ordering, not here.
 *
 * ── Loading, and failure ─────────────────────────────────────────────────────
 *
 * Loading fills the real boxes with placeholders of the same geometry, so the
 * page does not settle when the posts arrive.
 *
 * If WordPress cannot be read — which is routine in local development, where
 * the CMS is simply not running — the section renders NOTHING and the page
 * closes over it. The same decision Featured AI Tools and Recently Added make,
 * for the same reason: it carries no editorial content of its own that survives
 * the loss of its source, and a heading over an empty band is worse than no
 * heading. The reader is never shown the API's error text; /blog is where a
 * failure is worth explaining, and it already does, with a retry.
 *
 * Fewer than three published posts is not a failure: one post renders the lead
 * card alone, two render the lead plus a single tile. No empty cards are drawn
 * to fill the row.
 */

/** One lead story plus two beside it, as in the handoff. */
const POST_COUNT = 3

/*
 * The secondary row's tracks.
 *
 * Two explicit columns rather than the handoff's
 * `repeat(auto-fit,minmax(270px,1fr))`, which renders identically for the case
 * the prototype has — two posts, two half-width cards — but not for the case
 * only live content produces. `auto-fit` collapses empty tracks and lets the
 * survivors absorb the space, so with a single secondary post the lone tile
 * would stretch the full 1016px and its 16:9 media would stand 571px tall. Two
 * columns keep every tile on the same proportions no matter how many posts are
 * published, and one column below `sm` is where the design's 270px floor puts
 * the fold anyway.
 */
const SECONDARY_ROW = 'mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2'

export default function BlogInsightsSection() {
  const { data: posts, isLoading, error } = useLatestBlogPosts(POST_COUNT)

  const [featured, ...secondary] = posts ?? []

  // Nothing here means anything without the CMS, so the section stands down.
  if (error || (!isLoading && !featured)) return null

  return (
    <section className="relative pt-[92px] pb-[88px]">
      {/* The warm brown band, and the hairlines that open and close it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(28,20,14,0)_0%,rgba(28,20,14,0.6)_14%,rgba(28,20,14,0.6)_86%,rgba(28,20,14,0)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] bottom-0 left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />

      {/* 1080px, not the page's 1240: the handoff narrows this section so the
          lead card's copy column stays a readable measure. */}
      <div className="relative mx-auto max-w-[1080px] px-8">
        <div data-reveal="0" className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11.5px] tracking-[0.2em] text-[#E0BE94] uppercase">
              Editorial
            </div>
            <h2 className="mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
              Blog &amp; Insights
            </h2>
          </div>
          <Link
            to="/blog"
            className="inline-flex items-center gap-[7px] px-1 py-2 text-[14.5px] font-medium whitespace-nowrap text-muted-soft transition-colors duration-[250ms] hover:text-[#EBD3A6]"
          >
            View all
            <span aria-hidden="true" className="text-[15px]">
              →
            </span>
          </Link>
        </div>

        {isLoading && (
          <div role="status" aria-label="Loading the latest stories">
            <div className="mt-7">
              <InsightFeaturedSkeleton />
            </div>
            <div className={SECONDARY_ROW}>
              <BlogInsightsSkeleton count={POST_COUNT - 1} />
            </div>
          </div>
        )}

        {!isLoading && featured && (
          <>
            <div className="mt-7">
              <InsightFeaturedCard post={featured} />
            </div>
            {secondary.length > 0 && (
              <div className={SECONDARY_ROW}>
                {secondary.map((post, index) => (
                  <InsightCard key={post.id} post={post} index={index} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
