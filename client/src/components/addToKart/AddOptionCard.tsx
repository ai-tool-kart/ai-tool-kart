import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/*
 * One of the two cards inside the closing CTA frame.
 *
 * Source: AI Tool Kart Site.dc.html, the `sc-for addOptions` card inside
 * `data-screen-label="Add to the Kart"` — r24, violet-hairline glass, a 44px
 * icon tile, the title, the body, and the violet CTA capsule pinned to the
 * bottom by `margin-top:auto` so both capsules sit on one baseline however
 * unevenly the two bodies wrap.
 *
 * ── The whole card is the link ───────────────────────────────────────────────
 *
 * The prototype puts `onClick` on the card div and renders the capsule as a
 * plain span, which gives a mouse user a big target and a keyboard user none.
 * Here the card IS the <Link>, so the click target and the tab stop are the
 * same element and there is exactly one of them per card — the same correction
 * BlogCard, InsightCard and SocialCard already make. The capsule stays a span:
 * a second, nested link to the same place would be a second tab stop announcing
 * the same destination.
 *
 * The accessible name is given explicitly, because the card's own contents read
 * as one run-on string ("Submit a Tool Add your AI tool to the directory…
 * Submit").
 */

interface AddOptionCardProps {
  title: string
  body: string
  /** Capsule label. The arrow is added here so both cards carry the same one. */
  cta: string
  /** Internal route. React Router, same tab — never an external target. */
  to: string
  icon: ReactNode
}

export default function AddOptionCard({ title, body, cta, to, icon }: AddOptionCardProps) {
  return (
    <Link
      to={to}
      aria-label={title}
      data-spot="1"
      className="group relative flex max-w-[420px] min-w-0 flex-[1_1_300px] flex-col gap-[13px] overflow-hidden rounded-panel border border-[rgba(178,150,255,0.24)] bg-[linear-gradient(180deg,rgba(255,255,255,0.058)_0%,rgba(255,255,255,0.018)_100%)] px-[22px] py-6 no-underline shadow-[inset_0_1px_0_rgba(232,222,255,0.2),0_1px_2px_rgba(0,0,0,0.4),0_26px_48px_-34px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-[rgba(196,168,255,0.5)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.086)_0%,rgba(255,255,255,0.026)_100%)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_2px_6px_rgba(0,0,0,0.45),0_34px_62px_-30px_rgba(124,88,244,0.8)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:translate-y-[-2px] active:scale-[0.99]"
    >
      {/* The violet spotlight, faded in by the shared pointer hook. Geometry and
          fade come from [data-spot-layer] in styles/index.css; only the radius
          of the falloff is restated, because the design widens it to 220px on
          this card. */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="[background:radial-gradient(220px_circle_at_var(--mx,50%)_var(--my,50%),rgba(167,139,250,0.18)_0%,rgba(255,255,255,0.035)_36%,transparent_66%)]"
      />

      <span className="relative flex h-11 w-11 items-center justify-center rounded-[14px] border border-[rgba(178,150,255,0.3)] bg-[linear-gradient(158deg,rgba(167,139,250,0.24),rgba(255,255,255,0.03))] text-[#DCCCFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
        {icon}
      </span>

      <span className="relative text-[19px] font-semibold tracking-[-0.02em] text-[#F6F3FD]">
        {title}
      </span>

      <span className="relative text-[14px] leading-[1.6] text-pretty text-muted-dim">
        {body}
      </span>

      <span className="relative mt-auto inline-flex h-[46px] items-center gap-[9px] self-start rounded-pill border border-white/[0.22] bg-[linear-gradient(180deg,#B08CFF_0%,#8858F2_48%,#6A32DC_100%)] px-[22px] text-[14.5px] font-semibold tracking-[-0.008em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_14px_30px_-14px_rgba(124,88,244,0.95)]">
        {cta}
        <span
          aria-hidden="true"
          className="text-[15px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-x-1"
        >
          →
        </span>
      </span>
    </Link>
  )
}
