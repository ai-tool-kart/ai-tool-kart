import type { CSSProperties } from 'react'
import { ctaLabel, priceTone, toneForIndex } from '@/components/catalogue/toolCardTone'
import type { Tool } from '@/types/tool'

/*
 * The final-design tool card, typed on a real catalogue record.
 *
 * Source: AI Tool Kart Site.dc.html, the `results` grid on the browse screen. A
 * 132px media band carrying a tinted wash and the monogram, then the body:
 * name, `category · model`, tagline, pricing chip, and a two-button footer.
 * The card lifts 6px on hover, tracks a spotlight through `[data-spot]`, and
 * paints a matching edge glow through `[data-spot-edge]` — both installed once
 * by hooks/useDesignInteractions.ts, which is why there are no handlers here.
 *
 * This is THE catalogue card. Browse renders it today; the Milestone 4 home
 * sections (Featured, Recently added, AI for your work) are meant to render the
 * same component rather than growing variants of their own. It takes a `Tool`
 * and an index and nothing else, so any list can use it.
 *
 * ── What the design shows that the catalogue cannot ──────────────────────────
 *
 * The design's card carries a star rating, a review count and an editorial
 * badge. Verified against all 66 live records: `rating` is 0, `reviews` is 0 and
 * `badge` is "" on every single one — the catalogue does not run a review
 * programme and does not pretend to. Rendering "★ 0" and "0 reviews" on every
 * card would be inventing a signal, and a bad one.
 *
 * So each is rendered ONLY when it holds a value. Today that means none of them
 * appear; the day the catalogue gains ratings they appear with no code change.
 * That is the difference between a fallback and a fabrication.
 */

/** The custom properties the design drives its per-card colours through. */
interface ToneVars extends CSSProperties {
  '--acc': string
  '--glow': string
  '--t1': string
  '--t2': string
}

interface CatalogueToolCardProps {
  tool: Tool
  /** Position in the grid. Drives the four-tone rotation only. */
  index: number
  /** Opens the tool. Omit and the primary button links out to `tool.url`. */
  onOpen?: (tool: Tool) => void
  onCompare?: (tool: Tool) => void
}

export default function CatalogueToolCard({
  tool,
  index,
  onOpen,
  onCompare,
}: CatalogueToolCardProps) {
  const tone = toneForIndex(index)
  const price = priceTone(tool.model)

  const style: ToneVars = {
    '--acc': tone.accent,
    '--glow': tone.glow,
    '--t1': tone.tint,
    '--t2': tone.tintStrong,
  }

  return (
    <article
      data-reveal="stagger"
      data-spot="1"
      style={style}
      className="relative flex flex-col overflow-hidden rounded-panel border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_100%)] shadow-[inset_0_1px_0_rgba(224,212,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_24px_46px_-34px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[6px] hover:border-[rgba(178,150,255,0.32)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.078)_0%,rgba(255,255,255,0.022)_100%)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_2px_6px_rgba(0,0,0,0.45),0_34px_60px_-30px_var(--glow)]"
    >
      {/* Cursor spotlight and the matching 1px edge glow, both driven by the
          shared pointer hook. The edge uses a mask-composite ring so the glow
          lands on the border rather than washing the card. */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[4] rounded-panel opacity-0 transition-opacity duration-[350ms] [background:radial-gradient(220px_circle_at_var(--mx,50%)_var(--my,50%),var(--t1)_0%,rgba(255,255,255,0.03)_34%,transparent_64%)]"
      />
      <span
        data-spot-edge="1"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[5] rounded-panel p-px opacity-0 transition-opacity duration-[350ms] [background:radial-gradient(190px_circle_at_var(--mx,50%)_var(--my,50%),var(--acc)_0%,rgba(255,255,255,0.13)_40%,transparent_68%)] [mask-composite:exclude] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)]"
      />

      <div className="relative flex h-[132px] items-center justify-center overflow-hidden border-b border-white/[0.06] bg-[linear-gradient(158deg,var(--t1)_0%,rgba(18,14,32,0.72)_62%,rgba(12,9,22,0.9)_100%)]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[-40%] left-1/2 h-[150%] w-[150%] -translate-x-1/2 bg-[radial-gradient(46%_42%_at_50%_60%,var(--t1)_0%,transparent_72%)] blur-[14px]"
        />
        <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[19px] border border-[color:var(--t2)] bg-[linear-gradient(158deg,rgba(255,255,255,0.14)_0%,rgba(18,14,32,0.94)_100%)] text-[19px] font-bold tracking-[-0.02em] text-[#F5EFFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_18px_30px_-16px_var(--glow)]">
          {tool.mono}
        </span>

        {/* Empty across the seeded catalogue; rendered the day one is set. */}
        {tool.badge && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-[5px] rounded-pill border border-[rgba(190,164,255,0.42)] bg-[linear-gradient(180deg,rgba(96,64,190,0.55),rgba(46,30,96,0.5))] px-[10px] py-[5px] text-[9.5px] font-bold tracking-[0.13em] text-[#EADFFF] uppercase">
            <span
              aria-hidden="true"
              className="h-[4.5px] w-[4.5px] rounded-full bg-[#C4AAFF] shadow-[0_0_8px_1.5px_rgba(167,139,250,0.9)]"
            />
            {tool.badge}
          </span>
        )}
      </div>

      <div className="relative z-[2] flex flex-auto flex-col gap-[11px] p-[18px]">
        <div className="flex items-start gap-[10px]">
          <div className="flex min-w-0 flex-auto flex-col gap-[3px]">
            <h3 className="truncate text-[16.5px] font-semibold tracking-[-0.018em] text-[#F5F2FD]">
              {tool.name}
            </h3>
            <p className="truncate text-[12px] text-[#7C7697]">
              {tool.cat} · {tool.model}
            </p>
          </div>
          {tool.rating > 0 && (
            <span className="inline-flex flex-none items-center gap-[5px] pt-[2px]">
              <svg viewBox="0 0 24 24" fill="#E5C48C" aria-hidden="true" className="h-[12.5px] w-[12.5px]">
                <path d="m12 3.6 2.6 5.4 5.9.82-4.3 4.16 1.03 5.86L12 17.1 6.77 19.84 7.8 13.98 3.5 9.82l5.9-.82L12 3.6Z" />
              </svg>
              <span className="text-[13px] font-semibold text-[#DCD6EC]">
                {tool.rating.toFixed(1)}
              </span>
            </span>
          )}
        </div>

        {/* The design's fixed 62px keeps every footer in a row on the same
            baseline whether the tagline runs to two lines or four. */}
        <p className="min-h-[62px] text-[13px] leading-[1.6] text-pretty text-[#8A849F]">
          {tool.tagline}
        </p>

        <div className="flex items-center gap-2">
          <span
            style={{ color: price.fg, borderColor: price.border, background: price.background }}
            className="rounded-pill border px-[11px] py-[5px] text-[11.5px] font-medium whitespace-nowrap"
          >
            {tool.model}
          </span>
          {tool.reviews > 0 ? (
            <span className="truncate text-[12px] text-[#615C7A]">
              {tool.reviews.toLocaleString()} reviews
            </span>
          ) : (
            /* The design puts the review count here. With none to show, the
               slot carries the tool's actual price string instead — real
               information, in the space that was reserved for information. */
            <span className="truncate text-[12px] text-[#615C7A]">{tool.price}</span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-white/[0.06] pt-[14px]">
          <PrimaryAction tool={tool} onOpen={onOpen} />
          {onCompare && (
            <button
              type="button"
              onClick={() => onCompare(tool)}
              className="inline-flex h-10 flex-none cursor-pointer items-center rounded-pill border border-white/[0.09] bg-white/[0.035] px-[14px] text-[13px] font-medium text-[#C4BDDC] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)] transition-[color,border-color,background-color] duration-300 hover:border-[rgba(178,150,255,0.32)] hover:bg-[rgba(124,90,246,0.14)] hover:text-[#EFE9FF]"
            >
              Compare
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * The card's primary button.
 *
 * With no tool-detail route yet (see the milestone report), the honest
 * destination is the vendor's own site, which every record carries. It is a real
 * anchor rather than a click handler so it middle-clicks, opens in a new tab and
 * shows its target in the status bar like any other link. `onOpen` takes over
 * the moment an internal destination exists, and nothing else about the card
 * changes when it does.
 */
function PrimaryAction({ tool, onOpen }: { tool: Tool; onOpen?: (tool: Tool) => void }) {
  const className =
    'inline-flex h-10 flex-auto cursor-pointer items-center justify-center gap-[7px] rounded-pill border border-white/[0.22] bg-[linear-gradient(180deg,#B08CFF_0%,#8858F2_48%,#6A32DC_100%)] px-[14px] text-[13.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_14px_28px_-18px_rgba(116,80,244,0.95)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_20px_36px_-18px_rgba(116,80,244,1)]'

  const label = (
    <>
      {ctaLabel(tool)}
      <span aria-hidden="true" className="text-[14px]">
        →
      </span>
    </>
  )

  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(tool)} className={className}>
        {label}
      </button>
    )
  }

  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${ctaLabel(tool)} — ${tool.name} (opens in a new tab)`}
      className={className}
    >
      {label}
    </a>
  )
}
