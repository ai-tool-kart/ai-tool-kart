import { Link } from 'react-router-dom'
import FeaturedToolsSkeleton from '@/components/featured/FeaturedToolsSkeleton'
import FeaturedToolTile from '@/components/featured/FeaturedToolTile'
import TodaysPickCard from '@/components/featured/TodaysPickCard'
import { FEATURED_SELECTION } from '@/data/featuredTools'
import { useToolIndex } from '@/hooks/useToolIndex'
import type { FeaturedTool } from '@/types/featured'
import type { Tool } from '@/types/tool'

/*
 * "Featured AI Tools" — the editors' desk.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Featured"`. It follows
 * AI for Your Work in the final design, and does so here. It REPLACES the
 * earlier FeaturedSection, which was built from the v1 export and rendered six
 * mock tools in a plain grid; this is the same section redesigned, not a new one
 * beside it.
 *
 * The section is the design's second warm passage: a gold-lit band holding one
 * large pick on the left and five smaller cards on the right.
 *
 * ── Editorial vs catalogue ───────────────────────────────────────────────────
 *
 * The only editorial content is WHICH tools appear, their badges, and the
 * section's own words. Every fact rendered about a tool — name, category,
 * vendor, description, rating, review count, monogram — is read from the live
 * record through the shared catalogue index. The ratings are the same numbers
 * Browse shows, because they are the same field of the same record.
 *
 * ── Media ────────────────────────────────────────────────────────────────────
 *
 * The catalogue serves no imagery yet, so every slot resolves to its fallback:
 * the monogram for marks, and the design's dashed media slot for Today's Pick's
 * banner. Both are real components taking a URL, not stand-ins to be replaced —
 * the day a record carries `interfaceScreenshotUrl` the image appears in the
 * same box at the same size. See utils/toolMedia.ts for the resolution order.
 *
 * ── Failure ──────────────────────────────────────────────────────────────────
 *
 * If nothing resolves, the section renders NOTHING and the page closes over it.
 * That is different from Popular Ways and AI for Your Work on purpose: those
 * carry editorial content that still means something without the catalogue, and
 * this one does not. A heading over two empty panels would be worse than a
 * heading that is not there. Partial resolution renders whatever resolved.
 */

interface Resolved {
  entry: FeaturedTool
  tool: Tool
}

export default function FeaturedToolsSection() {
  const { index, isLoading } = useToolIndex()

  const resolve = (entry: FeaturedTool): Resolved | undefined => {
    const tool = index?.get(entry.slug)
    return tool ? { entry, tool } : undefined
  }

  const pick = resolve(FEATURED_SELECTION.todaysPick)
  // Order is the config's, so the grid is the same every render. A slug the
  // catalogue no longer has drops out rather than rendering an empty card.
  const alsoFeatured = FEATURED_SELECTION.alsoFeatured
    .map(resolve)
    .filter((item): item is Resolved => item !== undefined)

  const nothingResolved = !isLoading && !pick && alsoFeatured.length === 0
  if (nothingResolved) return null

  return (
    <section className="relative pt-[92px] pb-[88px]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(30,21,10,0)_0%,rgba(30,21,10,0.62)_14%,rgba(30,21,10,0.62)_86%,rgba(30,21,10,0)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] bottom-0 left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />
      {/* The slow gold bloom behind the pick. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[44%] left-[14%] h-[400px] w-[min(700px,70%)] -translate-y-1/2 bg-[radial-gradient(52%_52%_at_40%_50%,rgba(214,164,84,0.16)_0%,rgba(214,164,84,0.04)_46%,transparent_74%)] blur-[44px] [animation:akBloomPulse_15s_ease-in-out_infinite]"
      />

      <div className="relative mx-auto max-w-site px-8">
        <div data-reveal="0" className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11.5px] tracking-[0.2em] text-[#E5C48C] uppercase">
              Editors&rsquo; desk
            </div>
            <h2 className="mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
              Featured AI Tools
            </h2>
          </div>
          <Link
            to="/browse"
            className="inline-flex items-center gap-[7px] px-1 py-2 text-[14.5px] font-medium whitespace-nowrap text-muted-soft transition-colors duration-[250ms] hover:text-[#EBD3A6]"
          >
            View all
            <span aria-hidden="true" className="text-[15px]">
              →
            </span>
          </Link>
        </div>

        {isLoading ? (
          <FeaturedToolsSkeleton />
        ) : (
          <div className="relative mt-7 flex flex-wrap items-stretch gap-5">
            {pick && (
              <TodaysPickCard
                tool={pick.tool}
                badge={pick.entry.badge}
                media={pick.entry.media}
              />
            )}

            {alsoFeatured.length > 0 && (
              <div
                data-reveal="0.08"
                className="flex min-w-0 flex-[1_1_480px] flex-col rounded-panel-lg border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.01)_100%)] p-6 shadow-[inset_0_1px_0_rgba(224,212,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.45),0_2px_4px_rgba(0,0,0,0.35),0_30px_56px_-48px_rgba(0,0,0,0.95)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-[17px] font-semibold tracking-[-0.014em] text-[#D8D2E4]">
                    Also featured
                  </h3>
                  <span className="text-[12px] whitespace-nowrap text-[#6E6884]">
                    Re-tested this month
                  </span>
                </div>
                <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-3">
                  {alsoFeatured.map(({ entry, tool }) => (
                    <FeaturedToolTile
                      key={entry.slug}
                      tool={tool}
                      badge={entry.badge}
                      media={entry.media}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
