import type { CSSProperties } from 'react'
import { StarIcon } from '@/components/featured/icons'
import ToolMediaFrame from '@/components/featured/ToolMediaFrame'
import { coolToneForIndex } from '@/components/recentlyAdded/recentTone'
import type { Tool } from '@/types/tool'
import { formatReviewCount } from '@/utils/format'
import { resolveToolBanner } from '@/utils/toolMedia'

/*
 * One card on the "Recently Added Tools" rail.
 *
 * Source: AI Tool Kart Site.dc.html, the `recentTools` loop inside
 * `data-screen-label="Recently added"`. A 232px column: a 5:4 media slot with
 * the NEW badge pinned to its corner, then the name, the description, a rating
 * row and two metadata pills.
 *
 * ── Every fact on this card is the catalogue's ───────────────────────────────
 *
 * Name, description, rating, review count, pricing chip and category all come
 * off the live record. Nothing is restated in a homepage config, and there is no
 * rating logic here — the number is `tool.rating`, so a tool shown on this rail
 * and on Browse always carries the same one, formatted by the same helper.
 *
 * Only two things are the SECTION's: the cool tone rotation (recentTone.ts) and
 * whether the NEW badge shows — and the second is a question about the data, not
 * a decision made here. The card is handed the answer; see utils/recency.ts.
 *
 * ── Optional data ────────────────────────────────────────────────────────────
 *
 * The rating row and each pill render only when the record actually holds the
 * value. A tool the catalogue has not rated shows no stars rather than "★ 0",
 * and a tool with no media shows the design's own empty slot rather than a
 * borrowed picture. Same rule the Browse card and the editors' desk follow.
 *
 * Rendered as a real anchor to the vendor's site rather than the handoff's
 * onClick-on-a-div, matching FeaturedToolTile and the Browse card's primary
 * action: it is keyboard reachable, middle-clickable, and shows where it goes.
 * That is the only outbound destination the catalogue can honestly offer until
 * a /tools/:slug route exists.
 */

/** The custom properties the design drives its per-card colours through. */
interface ToneVars extends CSSProperties {
  '--acc': string
  '--glow': string
  '--t1': string
  '--t2': string
}

interface RecentToolCardProps {
  tool: Tool
  /** Position on the rail. Drives the three-tone rotation and the reveal delay. */
  index: number
  /** Whether the record is recent enough to be badged. Decided by the section. */
  isNew: boolean
}

export default function RecentToolCard({ tool, index, isNew }: RecentToolCardProps) {
  const tone = coolToneForIndex(index)
  const banner = resolveToolBanner(tool)

  const style: ToneVars = {
    '--acc': tone.accent,
    '--glow': tone.glow,
    '--t1': tone.tint,
    '--t2': tone.tintStrong,
  }

  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${tool.name} (opens in a new tab)`}
      data-spot="1"
      data-reveal="stagger"
      style={style}
      className="relative flex w-[232px] flex-none snap-start flex-col overflow-hidden rounded-card-lg border border-hairline bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_100%)] px-4 pt-[18px] pb-4 shadow-[inset_0_1px_0_rgba(224,212,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_20px_38px_-30px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[6px] hover:border-white/[0.17] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.085)_0%,rgba(255,255,255,0.026)_100%)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_2px_6px_rgba(0,0,0,0.45),0_30px_54px_-28px_var(--glow)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8FB4FF] active:translate-y-[-2px] active:scale-[0.99]"
    >
      {/*
       * The two cursor-tracking layers, faded in by the shared pointer hook in
       * hooks/useDesignInteractions.ts. Geometry and fade come from
       * [data-spot-layer] / [data-spot-edge] in styles/index.css; only the fill
       * is restated, because it keys off this card's own `--t1`.
       */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="[background:radial-gradient(190px_circle_at_var(--mx,50%)_var(--my,50%),var(--t1)_0%,rgba(255,255,255,0.04)_34%,transparent_64%)]"
      />
      <span data-spot-edge="1" aria-hidden="true" />

      <div className="relative">
        <ToolMediaFrame
          src={banner}
          name={tool.name}
          fallback="slot"
          className="aspect-[5/4] w-full rounded-tile border border-white/[0.1] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_24px_-20px_var(--glow)]"
        />
        {isNew && <NewBadge />}
      </div>

      <div className="relative mt-4 truncate text-[16px] font-semibold tracking-[-0.018em] text-[#F3F0FB]">
        {tool.name}
      </div>
      {/*
       * The handoff's descriptions are one or two lines each; a real tagline
       * runs to 160 characters. Clamped to three lines so the rail keeps the
       * design's card proportions instead of every card growing to the tallest
       * one — the cards are flex children and would otherwise stretch together.
       */}
      <p className="relative mt-[5px] line-clamp-3 text-[12.5px] leading-[1.5] text-pretty text-[#7E7899]">
        {tool.tagline}
      </p>

      {tool.rating > 0 && (
        <div className="relative mt-[14px] flex items-center gap-[6px]">
          <StarIcon className="h-[12.5px] w-[12.5px] text-[#E5C48C]" />
          <span className="text-[12.5px] font-semibold text-[#D9D3EA]">
            {tool.rating.toFixed(1)}
          </span>
          {tool.reviews > 0 && (
            <>
              <span aria-hidden="true" className="text-[12px] text-[#615C7A]">
                ·
              </span>
              <span className="text-[12px] text-muted-dim">
                {formatReviewCount(tool.reviews)} reviews
              </span>
            </>
          )}
        </div>
      )}

      <div className="relative mt-[14px] flex flex-wrap items-center gap-[6px]">
        {/* The design tints the pricing pill with the card's own accent rather
            than the Browse card's per-model colour, so the rail stays one
            temperature. The VALUE is still the record's. */}
        <span className="rounded-pill border border-[color:var(--t2)] bg-[color:var(--t1)] px-[10px] py-1 text-[11.5px] font-medium whitespace-nowrap text-[color:var(--acc)]">
          {tool.model}
        </span>
        <span className="rounded-pill border border-white/[0.09] bg-white/[0.03] px-[10px] py-1 text-[11.5px] font-medium whitespace-nowrap text-[#9A94B4]">
          {tool.cat}
        </span>
      </div>
    </a>
  )
}

/**
 * The NEW badge, traced from the handoff.
 *
 * A lit dot and the word, on the section's blue glass. `aria-hidden` on the dot
 * only — the word itself is real information for a screen reader, because it is
 * the one thing on the card that is not repeated in the text.
 */
function NewBadge() {
  return (
    <span className="pointer-events-none absolute top-[9px] right-[9px] z-[2] inline-flex items-center gap-[5px] rounded-pill border border-[rgba(150,190,255,0.44)] bg-[linear-gradient(180deg,rgba(40,78,196,0.8),rgba(18,38,118,0.66))] px-[9px] py-1 text-[10px] font-bold tracking-[0.14em] text-[#EADFFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_6px_16px_-8px_rgba(0,0,0,0.8),0_0_18px_-8px_rgba(120,170,255,0.9)] backdrop-blur-[8px]">
      <span
        aria-hidden="true"
        className="h-[5px] w-[5px] rounded-full bg-[#9CC6FF] shadow-[0_0_8px_1.5px_rgba(120,170,255,0.9)]"
      />
      NEW
    </span>
  )
}
