import { priceTone } from '@/components/catalogue/toolCardTone'
import type { Tool } from '@/types/tool'
import { formatAddedLabel } from '@/utils/launchDates'
import { isRecentlyAdded } from '@/utils/recency'

/*
 * The newest launch, given the whole width of the page.
 *
 * Source: AI Tool Kart Site.dc.html, the r28 panel under the New Launches
 * header: a two-track grid with the artwork panel on the left (a violet wash
 * behind a 96px monogram) and the copy centred on the right.
 *
 * ── Which tool this is ───────────────────────────────────────────────────────
 *
 * Whichever tool the page hands it — the first of the current filtered,
 * newest-first list. Nothing about the hero is pinned to a name or a slug, so
 * publishing a tool tomorrow moves it here on the next load, and choosing a
 * category moves it to that category's newest.
 *
 * ── The "Just added" badge is conditional ────────────────────────────────────
 *
 * The handoff prints it unconditionally, because its prototype list was ten
 * tools all under two days old. Against a real catalogue the newest tool in a
 * quiet category can be months old, and stamping "Just added" on it would be a
 * claim the date contradicts two lines below. So it renders only when
 * `isRecentlyAdded` agrees — the same 30-day rule the homepage rail badges on.
 *
 * ── The empty fields ─────────────────────────────────────────────────────────
 *
 * Rating renders only when there is one, exactly as on the catalogue card. A
 * catalogue that has not rated a tool must not print "0.0".
 */

interface LaunchHeroCardProps {
  tool: Tool
  /** One timestamp for the whole render, so the page cannot disagree with itself. */
  now: number
}

export default function LaunchHeroCard({ tool, now }: LaunchHeroCardProps) {
  const price = priceTone(tool.model)
  const added = formatAddedLabel(tool, now)
  const justAdded = isRecentlyAdded(tool, now)

  return (
    <div
      data-reveal="0"
      data-spot="1"
      className="relative mt-[34px] grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] overflow-hidden rounded-panel-lg border border-white/[0.08] bg-[linear-gradient(140deg,rgba(124,88,244,0.13)_0%,rgba(255,255,255,0.042)_40%,rgba(255,255,255,0.014)_100%)] shadow-[inset_0_1px_0_rgba(232,222,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.4),0_40px_74px_-46px_rgba(72,34,180,0.7)] transition-[transform,border-color,box-shadow] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-[rgba(178,150,255,0.36)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_2px_6px_rgba(0,0,0,0.45),0_50px_86px_-42px_rgba(124,88,244,0.78)]"
    >
      {/* Geometry and fade come from [data-spot-layer] in styles/index.css. */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="z-[4] [background:radial-gradient(300px_circle_at_var(--mx,50%)_var(--my,50%),rgba(167,139,250,0.14)_0%,rgba(255,255,255,0.03)_38%,transparent_66%)]"
      />

      {/*
       * The artwork panel. The catalogue serves no imagery yet, so this is the
       * monogram treatment the design itself specifies here — not a stand-in
       * for a picture. It is the same mark Browse, the assistant and the setup
       * stacks show for this tool.
       */}
      <div className="relative flex min-h-[250px] items-center justify-center overflow-hidden bg-[linear-gradient(158deg,rgba(167,139,250,0.2)_0%,rgba(18,14,32,0.72)_62%,rgba(11,8,20,0.92)_100%)]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[-30%] left-1/2 h-[140%] w-[140%] -translate-x-1/2 bg-[radial-gradient(44%_40%_at_50%_58%,rgba(167,139,250,0.26)_0%,transparent_72%)] blur-[18px]"
        />
        <span className="relative flex h-24 w-24 items-center justify-center rounded-panel-lg border border-[rgba(190,164,255,0.4)] bg-[linear-gradient(158deg,rgba(255,255,255,0.16)_0%,rgba(18,14,32,0.94)_100%)] text-[29px] font-bold tracking-[-0.02em] text-[#F7F2FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_26px_44px_-18px_rgba(124,88,244,0.95)]">
          {tool.mono}
        </span>
      </div>

      <div className="relative flex flex-col justify-center gap-[15px] px-[clamp(22px,3vw,34px)] py-9">
        <div className="flex flex-wrap items-center gap-[10px]">
          {justAdded && (
            <span className="inline-flex items-center gap-[6px] rounded-pill border border-[rgba(190,164,255,0.42)] bg-[linear-gradient(180deg,rgba(96,58,214,0.72),rgba(58,32,150,0.6))] px-[11px] py-[5px] text-[9.5px] font-bold tracking-[0.14em] text-[#EADFFF] uppercase">
              <span
                aria-hidden="true"
                className="h-[4.5px] w-[4.5px] rounded-full bg-[#C4AAFF] shadow-[0_0_8px_1.5px_rgba(167,139,250,0.9)]"
              />
              Just added
            </span>
          )}
          <span className="text-[12.5px] text-[#6E6890]">
            {tool.cat}
            {added && ` · added ${added}`}
          </span>
        </div>

        <h2 className="text-[29px] leading-[1.16] font-bold tracking-[-0.03em] text-pretty text-[#F6F3FD]">
          {tool.name}
        </h2>

        <p className="max-w-[44ch] text-[14.5px] leading-[1.62] text-pretty text-[#8A849F]">
          {tool.tagline}
        </p>

        <div className="flex flex-wrap items-center gap-[10px]">
          {tool.rating > 0 && (
            <span className="inline-flex items-center gap-[5px]">
              <svg viewBox="0 0 24 24" fill="#E5C48C" aria-hidden="true" className="h-[13px] w-[13px]">
                <path d="m12 3.6 2.6 5.4 5.9.82-4.3 4.16 1.03 5.86L12 17.1 6.77 19.84 7.8 13.98 3.5 9.82l5.9-.82L12 3.6Z" />
              </svg>
              <span className="text-[13.5px] font-semibold text-[#DCD6EC]">
                {tool.rating.toFixed(1)}
              </span>
              {tool.reviews > 0 && (
                <span className="text-[12.5px] text-[#6E6890]">
                  ({tool.reviews.toLocaleString()})
                </span>
              )}
            </span>
          )}
          <span
            style={{ color: price.fg, borderColor: price.border, background: price.background }}
            className="rounded-pill border px-[11px] py-[5px] text-[11.5px] font-medium"
          >
            {tool.model}
          </span>
        </div>

        {/*
         * The vendor's own site, in a new tab — the same honest destination
         * every catalogue card uses while there is no /tools/:slug route. A
         * real anchor, so it middle-clicks and previews like any link.
         */}
        <a
          href={tool.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`View ${tool.name} (opens in a new tab)`}
          className="group mt-1 inline-flex h-[46px] w-fit items-center gap-[9px] self-start rounded-pill border border-white/[0.22] bg-[linear-gradient(180deg,#B08CFF_0%,#8858F2_48%,#6A32DC_100%)] px-[22px] text-[14.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_16px_32px_-14px_rgba(124,88,244,0.95)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          View tool
          <span
            aria-hidden="true"
            className="text-[15px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-x-1"
          >
            →
          </span>
        </a>
      </div>
    </div>
  )
}
