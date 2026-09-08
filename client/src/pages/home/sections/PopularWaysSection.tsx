import { Link } from 'react-router-dom'
import PopularWayCard from '@/components/popularWays/PopularWayCard'
import { POPULAR_WAYS } from '@/data/popularWays'
import { useCardRail } from '@/hooks/useCardRail'
import { usePopularWays } from '@/hooks/usePopularWays'

/*
 * "Popular Ways to Use AI" — the homepage's outcome-first entry into Browse.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Popular ways"`. It sits
 * directly after the hero in the final design, and does so here.
 *
 * The section is the design's one warm passage: a sand-lit band between two
 * hairlines, holding a horizontal rail of six outcome cards. Its palette is
 * deliberately not the page's violet, which is why the colour values are stated
 * here rather than drawn from the violet accent tokens.
 *
 * ── What is editorial and what is the catalogue's ────────────────────────────
 *
 * The six outcomes, their wording and their category mapping are editorial
 * (data/popularWays.ts). The counts and topics on each card come from
 * GET /api/tools through hooks/usePopularWays.ts, and every card links into the
 * Browse state its own count describes. No tool record is restated here.
 *
 * ── Failure ──────────────────────────────────────────────────────────────────
 *
 * Nothing here can fail visibly. If the catalogue is unreachable the cards lose
 * their count and their topic line and stay exactly as useful — six links to
 * six filtered shelves. There is no error state and no retry, because there is
 * nothing a reader would do with one.
 */

/** The design's rail step floor: one 286px card plus its 16px gap. */
const RAIL_MIN_STEP = 302

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
 * The arrow buttons.
 *
 * Two deliberate departures from the handoff, both about the transform:
 *
 *  - the design centres them with `translateY(-50%)` AND marks them
 *    `data-magnet`, and the magnet hook writes `transform` outright — so in the
 *    prototype the button jumps half its height down the moment the cursor
 *    touches it. Centring through `top` leaves `transform` free for the magnet;
 *  - they are hidden below `md`. At 286px per card they would sit on top of a
 *    third of the first card on a phone, where the rail is swiped anyway.
 */
const ARROW =
  'absolute top-[calc(44%-23px)] z-[4] hidden h-[46px] w-[46px] items-center justify-center rounded-full border border-[rgba(230,210,172,0.36)] bg-[linear-gradient(180deg,rgba(40,32,20,0.86),rgba(16,13,9,0.82))] text-[#F6EDD8] shadow-[inset_0_1px_0_rgba(255,248,232,0.24),0_16px_34px_-16px_rgba(0,0,0,0.95),0_0_26px_-12px_rgba(196,158,96,0.7)] backdrop-blur-[12px] transition-[box-shadow,border-color,color] duration-300 hover:border-[rgba(248,232,200,0.62)] hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,250,238,0.36),0_18px_38px_-14px_rgba(0,0,0,1),0_0_34px_-10px_rgba(214,174,104,0.9)] md:flex'

export default function PopularWaysSection() {
  const { summaries, isLoading } = usePopularWays(POPULAR_WAYS)
  const rail = useCardRail({ minStep: RAIL_MIN_STEP })
  const mask = railMask(rail.canScrollPrev, rail.canScrollNext)

  return (
    <section className="relative mt-24 pt-[92px] pb-[88px]">
      {/* The warm band, and the hairline that opens and closes it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(26,21,15,0)_0%,rgba(26,21,15,0.75)_14%,rgba(26,21,15,0.75)_86%,rgba(26,21,15,0)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />

      <div className="relative mx-auto max-w-site px-8">
        <div data-reveal="0" className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11.5px] tracking-[0.2em] text-[#D8C6A2] uppercase">
              Start with the outcome
            </div>
            <h2 className="mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
              Popular Ways to Use AI
            </h2>
            <p className="mt-[14px] max-w-[58ch] text-[15px] leading-[1.62] tracking-[-0.006em] text-pretty text-muted-dim">
              Pick the result you&rsquo;re after. We assemble the tools, the workflow and the
              order to run them in.
            </p>
          </div>
          <Link
            to="/browse"
            data-magnet="1"
            className="inline-flex h-[54px] items-center gap-[10px] rounded-pill border border-[rgba(236,214,170,0.4)] bg-[linear-gradient(180deg,rgba(236,214,170,0.22)_0%,rgba(190,158,102,0.12)_100%)] px-7 text-[15px] font-semibold tracking-[-0.01em] whitespace-nowrap text-[#F6EDD8] shadow-[inset_0_1px_0_rgba(255,248,232,0.3),0_20px_42px_-26px_rgba(186,150,92,0.9)] transition-[border-color,background,box-shadow] duration-300 hover:border-[rgba(248,232,200,0.62)] hover:bg-[linear-gradient(180deg,rgba(244,226,190,0.32)_0%,rgba(196,164,108,0.18)_100%)] hover:text-[#F6EDD8] hover:shadow-[inset_0_1px_0_rgba(255,250,238,0.42),0_26px_52px_-22px_rgba(196,158,96,1)]"
          >
            Browse everything
            <span aria-hidden="true" className="text-[16px]">
              →
            </span>
          </Link>
        </div>

        <div className="relative mt-[26px]">
          <div
            ref={rail.ref}
            aria-busy={isLoading}
            style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
            /*
             * The generous bottom padding is the design's, and it is load-
             * bearing: the cards lift 5px and cast a 50px shadow on hover, and
             * an `overflow-x` box clips both without it.
             */
            className="flex gap-4 overflow-x-auto overflow-y-hidden px-[6px] pt-3 pb-[41px] [scroll-snap-type:x_proximity] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {POPULAR_WAYS.map((way) => (
              <PopularWayCard key={way.id} way={way} summary={summaries[way.id]} />
            ))}
          </div>

          {rail.canScrollPrev && (
            <button
              type="button"
              data-magnet="1"
              aria-label="Scroll to previous ways"
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
              aria-label="Scroll to more ways"
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
