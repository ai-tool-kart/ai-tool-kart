import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import PopularWayIcon from '@/components/popularWays/icons'
import type { PopularWaySummary } from '@/hooks/usePopularWays'
import type { PopularWay } from '@/types/popularWay'
import { EMPTY_FILTERS, toBrowseParams } from '@/utils/browseParams'

/*
 * One card on the "Popular Ways to Use AI" rail.
 *
 * Source: AI Tool Kart Site.dc.html — the `sc-for useCases` card. 286px wide,
 * r22, the warm sand treatment this section uses instead of the page's violet:
 * an icon tile, an optional badge, the outcome and its note, then a footer
 * carrying what the catalogue knows.
 *
 * Rendered as a <Link>, not the design's onClick-on-a-div, so the whole card is
 * a real link — keyboard reachable, focusable, openable in a new tab — and so
 * its destination is visible in the status bar before it is clicked. Same
 * decision as components/blog/BlogCard.tsx.
 *
 * ── The two halves of this card ──────────────────────────────────────────────
 *
 * Everything above the divider is editorial (data/popularWays.ts): the outcome
 * the homepage is choosing to promote. Everything below it except the cue is
 * the catalogue's own answer for this card's filter, supplied by
 * hooks/usePopularWays.ts — and every one of those fields renders only when it
 * resolved. The card is designed to read correctly with none of them: a reader
 * whose count never arrived still gets a working link to the right shelf, which
 * is the whole point of the card.
 */

/** The custom property the shared [data-spot-edge] rim reads. */
interface RimVars extends CSSProperties {
  '--acc': string
}

/* This section's rim is sand rather than the page's violet. */
const SAND_RIM: RimVars = { '--acc': '#ECD6AA' }

interface PopularWayCardProps {
  way: PopularWay
  /** Undefined until the catalogue answers, and after a request that failed. */
  summary?: PopularWaySummary
}

export default function PopularWayCard({ way, summary }: PopularWayCardProps) {
  const params = toBrowseParams({ ...EMPTY_FILTERS, cat: way.categories })

  return (
    <Link
      to={`/browse?${params.toString()}`}
      data-spot="1"
      data-reveal="stagger"
      style={SAND_RIM}
      className="group relative flex w-[286px] flex-none snap-start flex-col gap-[13px] overflow-hidden rounded-card-lg border border-hairline bg-[linear-gradient(180deg,rgba(255,252,246,0.05)_0%,rgba(255,255,255,0.015)_100%)] px-[18px] py-5 shadow-[inset_0_1px_0_rgba(244,232,210,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_20px_38px_-30px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-[rgba(230,210,172,0.3)] hover:bg-[linear-gradient(180deg,rgba(255,250,240,0.08)_0%,rgba(255,255,255,0.022)_100%)] hover:shadow-[inset_0_1px_0_rgba(248,238,218,0.3),0_2px_6px_rgba(0,0,0,0.45),0_28px_50px_-28px_rgba(186,150,92,0.55)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E6D2AC] active:translate-y-[-2px] active:scale-[0.99]"
    >
      {/*
       * The two cursor-tracking layers, faded in by the shared pointer hook in
       * hooks/useDesignInteractions.ts. Geometry, opacity and transition come
       * from [data-spot-layer] / [data-spot-edge] in styles/index.css; only the
       * fill is restated here, because this section's is sand where the rule's
       * default is violet.
       */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="[background:radial-gradient(190px_circle_at_var(--mx,50%)_var(--my,50%),rgba(230,210,172,0.14)_0%,rgba(255,255,255,0.03)_36%,transparent_66%)]"
      />
      <span data-spot-edge="1" aria-hidden="true" />

      <div className="relative flex items-center gap-[11px]">
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-field border border-[rgba(230,210,172,0.24)] bg-[linear-gradient(158deg,rgba(230,210,172,0.15)_0%,rgba(255,255,255,0.025)_100%)] text-[#EBDCBB] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <PopularWayIcon name={way.icon} className="h-5 w-5" />
        </span>
        {way.badge && (
          <span className="ml-auto rounded-pill border border-[rgba(230,210,172,0.34)] bg-[rgba(196,164,108,0.16)] px-[11px] py-[5px] text-[9.5px] font-bold tracking-[0.12em] whitespace-nowrap text-[#F2E4C6] uppercase">
            {way.badge}
          </span>
        )}
      </div>

      <div className="relative flex flex-col gap-[5px]">
        <h3 className="text-[17px] leading-[1.24] font-semibold tracking-[-0.018em] text-pretty text-[#F4F0E8]">
          {way.label}
        </h3>
        <p className="text-[13px] tracking-[-0.004em] text-[#8B8478]">{way.note}</p>
      </div>

      <div className="relative mt-auto flex flex-col gap-2 border-t border-white/[0.06] pt-[13px]">
        <div className="flex items-center gap-[9px]">
          {/*
           * The catalogue's own count for this card's filter — the same number
           * Browse shows for the same query, because it is the same question
           * asked of the same endpoint. Absent rather than zero while it is
           * unknown: "0 tools" on a shelf that has twelve is worse than nothing.
           */}
          {summary?.toolCount !== undefined && (
            <span className="text-[12px] font-semibold tracking-[-0.004em] text-[#C9BFA6]">
              {summary.toolCount} {summary.toolCount === 1 ? 'tool' : 'tools'}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-[6px] text-[12.5px] font-semibold text-[#9C947F] transition-colors duration-300 group-hover:text-[#D8C6A2]">
            Explore
            <span
              aria-hidden="true"
              className="text-[13px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-x-[3px]"
            >
              →
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-none rounded-pill border border-[rgba(230,210,172,0.22)] bg-[rgba(196,164,108,0.12)] px-[10px] py-1 text-[11px] font-semibold tracking-[-0.002em] whitespace-nowrap text-[#EADCBE]">
            {way.cue}
          </span>
          {/* What the shelf's most prominent tools are actually about. */}
          {summary && summary.topics.length > 0 && (
            <span className="min-w-0 overflow-hidden text-[11.5px] whitespace-nowrap text-ellipsis text-[#7E7768]">
              {summary.topics.join(' · ')}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
