import { Link } from 'react-router-dom'
import RecentToolCard from '@/components/recentlyAdded/RecentToolCard'
import RecentlyAddedSkeleton from '@/components/recentlyAdded/RecentlyAddedSkeleton'
import { useCardRail } from '@/hooks/useCardRail'
import { useRecentlyAddedTools } from '@/hooks/useRecentlyAddedTools'
import { EMPTY_FILTERS, toBrowseParams } from '@/utils/browseParams'
import { isRecentlyAdded } from '@/utils/recency'

/*
 * "Recently Added Tools" — what arrived on the kart last.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Recently added"`. It
 * follows Featured AI Tools in the final design, and does so here. A cool blue
 * band — the counterweight to the gold one above it — holding a horizontal rail
 * of 232px cards.
 *
 * ── What makes a tool "recent" ───────────────────────────────────────────────
 *
 * `tool.addedAt`: the date the CATALOGUE listed the tool. Nothing else. This
 * section is not a second Featured — there is no editorial list of slugs behind
 * it, and it deliberately does not read `pop`, `rating` or `reviews`, which
 * answer "how well regarded" rather than "how new". The ordering is
 * `sortByRecency`, which mirrors the server's `sort=newest` exactly; see
 * utils/recency.ts for why the sort runs here rather than over the network.
 *
 * Everything on a card is the live record's, including the rating and the review
 * count — the same numbers, from the same fields, that Browse and the editors'
 * desk show for the same tool.
 *
 * ── Loading, and failure ─────────────────────────────────────────────────────
 *
 * Loading fills the real rail with card-shaped placeholders, so the section does
 * not resize when the catalogue lands.
 *
 * If the catalogue cannot be read, the section renders NOTHING and the page
 * closes over it — the same decision Featured makes, for the same reason: unlike
 * Popular Ways or AI for Your Work, it carries no editorial content that still
 * means something without the catalogue. A heading over an empty rail is worse
 * than a heading that is not there.
 */

/** The rail's length. The handoff shows eight cards; so does this. */
const RECENT_COUNT = 8

/** The design's rail step floor: one 232px card plus its 16px gap. */
const RAIL_MIN_STEP = 248

/** Fades the rail's edges only where there is more content to scroll to. */
function railMask(canScrollPrev: boolean, canScrollNext: boolean): string | undefined {
  if (canScrollPrev && canScrollNext) {
    return 'linear-gradient(90deg,transparent 0,#000 4%,#000 96%,transparent 100%)'
  }
  if (canScrollPrev) return 'linear-gradient(90deg,transparent 0,#000 4%,#000 100%)'
  if (canScrollNext) return 'linear-gradient(90deg,#000 0,#000 96%,transparent 100%)'
  return undefined
}

/*
 * The arrow buttons, traced from the handoff — which keeps the page's violet
 * glass here rather than tinting them to the section's blue.
 *
 * Two deliberate departures, both the same ones PopularWaysSection makes:
 *
 *  - the design centres them with `translateY(-50%)` AND marks them
 *    `data-magnet`, and the magnet hook writes `transform` outright, so in the
 *    prototype the button jumps half its height the moment the cursor touches
 *    it. Centring through `top` leaves `transform` free for the magnet;
 *  - they are hidden below `md`. At 232px per card an arrow would sit on top of
 *    a fifth of the first card on a phone, where the rail is swiped anyway.
 */
const ARROW =
  'absolute top-[calc(42%-23px)] z-[4] hidden h-[46px] w-[46px] items-center justify-center rounded-full border border-[rgba(190,164,255,0.34)] bg-[linear-gradient(180deg,rgba(28,22,52,0.86),rgba(12,10,26,0.82))] text-[#EADFFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_34px_-16px_rgba(0,0,0,0.95),0_0_26px_-12px_rgba(167,139,250,0.7)] backdrop-blur-[12px] transition-[box-shadow,border-color,color] duration-300 hover:border-[rgba(196,168,255,0.6)] hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_20px_40px_-16px_rgba(0,0,0,1),0_0_40px_-10px_rgba(167,139,250,0.95)] md:flex'

export default function RecentlyAddedToolsSection() {
  const { tools, isLoading, failed } = useRecentlyAddedTools(RECENT_COUNT)
  const rail = useCardRail({ minStep: RAIL_MIN_STEP })
  const mask = railMask(rail.canScrollPrev, rail.canScrollNext)

  /*
   * One timestamp for the whole render, so the badge rule cannot answer
   * differently for the first card and the last.
   */
  const now = Date.now()

  // Nothing editorial survives a failed read here, so the section stands down.
  if (failed || (!isLoading && tools.length === 0)) return null

  /*
   * "View all" goes to Browse, ordered the way this rail is ordered — the same
   * `newest` sort, applied by the same catalogue. Built through
   * `toBrowseParams` rather than a hand-written string so the URL stays in the
   * one vocabulary Browse parses back.
   */
  const viewAllTo = `/browse?${toBrowseParams({ ...EMPTY_FILTERS, sort: 'newest' }).toString()}`

  return (
    <section className="relative pt-[92px] pb-[84px]">
      {/* The cool band, and the hairlines that open and close it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,14,32,0)_0%,rgba(8,14,32,0.85)_14%,rgba(8,14,32,0.85)_86%,rgba(8,14,32,0)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] bottom-0 left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />
      {/* The blue bloom the design floats behind the rail's right-hand end. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[30%] right-[8%] h-[340px] w-[min(760px,80%)] bg-[radial-gradient(52%_52%_at_60%_50%,rgba(70,120,240,0.14)_0%,transparent_72%)] blur-[40px]"
      />

      <div className="relative mx-auto max-w-site px-8">
        <div data-reveal="0" className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11.5px] tracking-[0.2em] text-[#8FB4FF] uppercase">
              Fresh off the platform
            </div>
            {/*
             * The one departure from the handoff's own values: it sets a fixed
             * 40px here, where the sections either side of it (Featured, How
             * People Are Using AI) use `clamp(30px,3.2vw,40px)`. The fixed value
             * reads as a prototype oversight rather than intent — 40px is the
             * same top end, and it is what every other heading on this page
             * already scales from. Same size on desktop, legible on a phone.
             */}
            <h2 className="mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
              Recently Added Tools
            </h2>
          </div>
          <Link
            to={viewAllTo}
            className="inline-flex items-center gap-[7px] px-1 py-2 text-[14.5px] font-medium whitespace-nowrap text-muted-soft transition-colors duration-[250ms] hover:text-[#C9B6FF]"
          >
            View all
            <span aria-hidden="true" className="text-[15px]">
              →
            </span>
          </Link>
        </div>

        <div className="relative mt-[26px]">
          <div
            ref={rail.ref}
            {...(isLoading ? { role: 'status', 'aria-label': 'Loading recently added tools' } : {})}
            style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
            /*
             * The generous bottom padding is the design's, and it is
             * load-bearing: the cards lift 6px and cast a 54px shadow on hover,
             * and an `overflow-x` box clips both without it.
             */
            className="flex gap-4 overflow-x-auto overflow-y-hidden px-[6px] pt-[14px] pb-[51px] [scroll-snap-type:x_proximity] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {isLoading ? (
              <RecentlyAddedSkeleton count={RECENT_COUNT} />
            ) : (
              tools.map((tool, index) => (
                <RecentToolCard
                  key={tool.id}
                  tool={tool}
                  index={index}
                  isNew={isRecentlyAdded(tool, now)}
                />
              ))
            )}
          </div>

          {rail.canScrollPrev && (
            <button
              type="button"
              data-magnet="1"
              aria-label="Scroll to previously added tools"
              onClick={() => rail.step(-1)}
              className={`${ARROW} left-[-4px]`}
            >
              <ArrowIcon direction="prev" />
            </button>
          )}
          {rail.canScrollNext && (
            <button
              type="button"
              data-magnet="1"
              aria-label="Scroll to more recently added tools"
              onClick={() => rail.step(1)}
              className={`${ARROW} right-[-4px]`}
            >
              <ArrowIcon direction="next" />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** The rail arrows, traced from the handoff's inline SVG. */
function ArrowIcon({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[19px] w-[19px]"
    >
      {direction === 'prev' ? (
        <>
          <path d="M19 12H5.5" />
          <path d="m11.5 5.5-6.5 6.5 6.5 6.5" />
        </>
      ) : (
        <>
          <path d="M5 12h13.5" />
          <path d="m12.5 5.5 6.5 6.5-6.5 6.5" />
        </>
      )}
    </svg>
  )
}
