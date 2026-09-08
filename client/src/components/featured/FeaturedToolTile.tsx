import { StarIcon } from '@/components/featured/icons'
import ToolMediaFrame from '@/components/featured/ToolMediaFrame'
import type { FeaturedMediaOverride } from '@/types/featured'
import type { Tool } from '@/types/tool'
import { resolveToolLogo } from '@/utils/toolMedia'

/*
 * One small card in the "Also featured" grid.
 *
 * Source: AI Tool Kart Site.dc.html, the `featuredPicks` loop — a square media
 * slot with an optional badge pinned to its corner, then the name, category and
 * rating.
 *
 * Name, category, monogram and rating come from the live record; only the badge
 * is this section's. The rating is the catalogue's own number, so a tool shown
 * here and on Browse always carries the same one.
 *
 * The square uses the MONOGRAM fallback rather than the handoff's dashed media
 * slot. At 128px the dashed frame is mostly ring, and the catalogue already has
 * a real mark for the tool — showing it is both better looking and more
 * informative than an empty box. The wide Today's Pick banner keeps the dashed
 * slot, because there the catalogue genuinely has nothing to show.
 *
 * The whole tile is a link to the tool's own site, matching the Browse card's
 * primary action — the only outbound link the catalogue can honestly offer until
 * a /tools/:slug route exists.
 */

interface FeaturedToolTileProps {
  tool: Tool
  badge?: string
  media?: FeaturedMediaOverride
}

export default function FeaturedToolTile({ tool, badge, media }: FeaturedToolTileProps) {
  const logo = resolveToolLogo(tool, media)

  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${tool.name} (opens in a new tab)`}
      data-spot="1"
      className="relative flex flex-col overflow-hidden rounded-card border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.038)_0%,rgba(255,255,255,0.012)_100%)] p-[13px] shadow-[inset_0_1px_0_rgba(224,212,255,0.1),0_1px_2px_rgba(0,0,0,0.4)] transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[4px] hover:border-[rgba(229,196,140,0.26)] hover:bg-[linear-gradient(180deg,rgba(255,252,246,0.062)_0%,rgba(255,255,255,0.02)_100%)] hover:shadow-[inset_0_1px_0_rgba(248,238,218,0.22),0_2px_6px_rgba(0,0,0,0.45),0_24px_42px_-26px_rgba(186,150,92,0.5)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E6D2AC] active:translate-y-[-1px] active:scale-[0.99]"
    >
      {/* The warm spotlight, faded in by the shared pointer hook. Geometry and
          fade come from [data-spot-layer] in styles/index.css. */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="[background:radial-gradient(150px_circle_at_var(--mx,50%)_var(--my,50%),rgba(230,210,172,0.13)_0%,rgba(255,255,255,0.03)_36%,transparent_64%)]"
      />

      <div className="relative">
        <ToolMediaFrame
          src={logo}
          name={tool.name}
          mono={tool.mono}
          fallback="monogram"
          size="lg"
          className="aspect-square w-full rounded-field border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
        />
        {badge && (
          <span className="pointer-events-none absolute top-[7px] left-[7px] z-[2] rounded-pill border border-[rgba(229,196,140,0.3)] bg-[linear-gradient(180deg,rgba(24,18,10,0.86),rgba(12,9,5,0.74))] px-[9px] py-1 text-[9.5px] font-bold tracking-[0.1em] whitespace-nowrap text-[#EFD8AA] uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_14px_-8px_rgba(0,0,0,0.85)] backdrop-blur-[8px]">
            {badge}
          </span>
        )}
      </div>

      <div className="relative mt-[11px] truncate text-[14px] font-semibold tracking-[-0.014em] text-[#E9E5F2]">
        {tool.name}
      </div>
      <div className="relative mt-[2px] truncate text-[11.5px] text-[#736D8A]">{tool.cat}</div>
      {tool.rating > 0 && (
        <div className="relative mt-[9px] flex items-center gap-[6px]">
          <StarIcon className="h-3 w-3 text-[#E5C48C]" />
          <span className="text-[12.5px] font-semibold text-[#CFC9DE]">
            {tool.rating.toFixed(1)}
          </span>
        </div>
      )}
    </a>
  )
}
