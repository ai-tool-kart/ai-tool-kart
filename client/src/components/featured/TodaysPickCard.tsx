import { PickStarIcon, StarIcon } from '@/components/featured/icons'
import ToolMediaFrame from '@/components/featured/ToolMediaFrame'
import type { FeaturedMediaOverride } from '@/types/featured'
import type { Tool } from '@/types/tool'
import { formatReviewCount, formatVendorHost } from '@/utils/format'
import { resolveToolBanner, resolveToolLogo } from '@/utils/toolMedia'

/*
 * Today's Pick — the large gold card on the left of the editors' desk.
 *
 * Source: AI Tool Kart Site.dc.html, the `data-cardish` card in the Featured
 * section: a 30px-radius panel drawn with a padding-box/border-box gradient pair
 * (CSS has no other way to express a gradient border), a lit hairline across its
 * top edge, then the header, a 16:9 media slot, the mark and name, the
 * description, and a footer holding the rating pill and "View Tool".
 *
 * ── Everything on this card except the badge is the catalogue's ──────────────
 *
 *   name, category, vendor, description   the live record
 *   rating, review count                  the live record — the same numbers
 *                                         Browse shows for the same tool
 *   monogram                              the live record
 *   badge                                 the section's editorial config
 *
 * The rating and review count are read straight off the record and formatted,
 * never recomputed: a second rating derived anywhere in the client is a second
 * rating that can disagree with the first.
 *
 * ── Hover ────────────────────────────────────────────────────────────────────
 *
 * The handoff lifts the card 5px and doubles a 150px gold bloom around it. The
 * lift is kept and the bloom is not: this is the largest surface on the page,
 * and a glow that reads as premium on a 286px card reads as glare at this size.
 * Same correction already applied to Browse and to the setup cards.
 */

interface TodaysPickCardProps {
  tool: Tool
  badge?: string
  media?: FeaturedMediaOverride
}

/* The design's gradient border: fill on padding-box, border on border-box. */
const CARD_BACKGROUND =
  'linear-gradient(168deg,rgba(214,164,84,0.16) 0%,rgba(255,255,255,0.058) 32%,rgba(255,255,255,0.02) 100%) padding-box,' +
  'linear-gradient(158deg,rgba(250,232,196,0.6) 0%,rgba(229,196,140,0.28) 26%,rgba(255,255,255,0.05) 58%,rgba(229,196,140,0.34) 100%) border-box'

export default function TodaysPickCard({ tool, badge, media }: TodaysPickCardProps) {
  const banner = resolveToolBanner(tool, media)
  const logo = resolveToolLogo(tool, media)
  const vendor = formatVendorHost(tool.url)

  return (
    <div
      data-reveal="0"
      style={{ background: CARD_BACKGROUND }}
      className="relative flex min-w-0 flex-[1_1_470px] flex-col overflow-hidden rounded-hero border border-transparent p-[30px] shadow-[inset_0_1px_0_rgba(252,238,208,0.26),inset_0_0_60px_-26px_rgba(240,200,130,0.4),inset_0_-1px_0_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.45),0_46px_90px_-46px_rgba(196,148,64,0.55)] transition-[transform,box-shadow] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:shadow-[inset_0_1px_0_rgba(255,244,220,0.34),0_2px_8px_rgba(0,0,0,0.5),0_54px_100px_-46px_rgba(196,148,64,0.7)]"
    >
      {/* The lit hairline across the card's upper edge. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[34%] left-[8%] h-px bg-[linear-gradient(90deg,transparent,rgba(252,238,208,0.85),transparent)]"
      />

      <div className="relative flex items-center gap-[10px]">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[11px] border border-[rgba(229,196,140,0.36)] bg-[linear-gradient(158deg,rgba(229,196,140,0.3),rgba(255,255,255,0.03))] text-[#F6E3BC] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]">
          <PickStarIcon className="h-4 w-4" />
        </span>
        <h3 className="text-[17px] font-semibold tracking-[-0.014em] text-[#F8F2E6]">
          Today&rsquo;s Pick
        </h3>
        {badge && (
          <span className="ml-auto rounded-pill border border-[rgba(229,196,140,0.34)] bg-[rgba(214,164,84,0.16)] px-[11px] py-[5px] text-[11px] tracking-[0.12em] whitespace-nowrap text-[#EFD8AA] uppercase">
            {badge}
          </span>
        )}
      </div>

      <ToolMediaFrame
        src={banner}
        name={tool.name}
        fallback="slot"
        size="lg"
        className="relative mt-[22px] aspect-[16/9] w-full rounded-card-lg border border-[rgba(252,238,208,0.16)] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_22px_44px_-28px_rgba(0,0,0,0.9)]"
      />

      <div className="relative mt-[22px] flex items-center gap-4">
        <ToolMediaFrame
          src={logo}
          name={tool.name}
          mono={tool.mono}
          fallback="monogram"
          size="lg"
          className="h-24 w-24 flex-none rounded-panel border border-[rgba(252,238,208,0.2)] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_16px_32px_-16px_rgba(196,148,64,0.8)]"
        />
        <div className="min-w-0">
          <div className="text-[25px] font-bold tracking-[-0.03em] text-[#FBF7F0]">
            {tool.name}
          </div>
          <div className="mt-1 truncate text-[13.5px] text-[#9C917E]">
            {/* The design's "category · provider". The catalogue records no
                company name, so the vendor's own host stands in for it. */}
            {vendor ? `${tool.cat} · ${vendor}` : tool.cat}
          </div>
        </div>
      </div>

      <p className="relative mt-4 max-w-[48ch] text-[15px] leading-[1.6] tracking-[-0.008em] text-pretty text-[#B4AA97]">
        {tool.tagline}
      </p>

      <div className="relative mt-auto flex flex-wrap items-center justify-between gap-[14px] pt-[26px]">
        {/* Rendered only when the catalogue has a rating — never "0.0". */}
        {tool.rating > 0 && (
          <span className="inline-flex items-center gap-[9px] rounded-pill border border-[rgba(229,196,140,0.22)] bg-[rgba(229,196,140,0.09)] px-[14px] py-[9px] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
            <StarIcon className="h-[14px] w-[14px] text-[#EFD8AA]" />
            <span className="text-[14px] font-semibold text-[#F6EFE2]">
              {tool.rating.toFixed(1)}
            </span>
            {tool.reviews > 0 && (
              <span className="text-[13px] whitespace-nowrap text-[#8D8474]">
                {formatReviewCount(tool.reviews)} reviews
              </span>
            )}
          </span>
        )}
        <a
          href={tool.url}
          target="_blank"
          rel="noreferrer noopener"
          data-magnet="1"
          aria-label={`View ${tool.name} (opens in a new tab)`}
          className="ml-auto inline-flex h-12 items-center gap-[9px] rounded-pill border border-white/[0.32] bg-[linear-gradient(180deg,#F7E2B4_0%,#E0BA78_48%,#C1913F_100%)] px-6 text-[14.5px] font-bold tracking-[-0.008em] whitespace-nowrap text-[#1E1608] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_16px_34px_-14px_rgba(196,148,64,0.9)] transition-[box-shadow] duration-[350ms] hover:text-[#1E1608] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_22px_46px_-16px_rgba(196,148,64,1)]"
        >
          View Tool
          <span aria-hidden="true" className="text-[15px]">
            →
          </span>
        </a>
      </div>
    </div>
  )
}
