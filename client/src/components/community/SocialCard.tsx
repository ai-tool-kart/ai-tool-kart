import CommunityCardShell from '@/components/community/CommunityCardShell'
import { toneVarsFor } from '@/components/community/communityTone'
import { CtaArrowIcon, SocialIcon } from '@/components/community/icons'
import type { ResolvedCommunityChannel } from '@/types/community'

/*
 * One compact social card. The same component draws X, Instagram, YouTube and
 * LinkedIn — they differ only in the config they are handed and the tone their
 * platform keys.
 *
 * Source: AI Tool Kart Site.dc.html, the `sc-for socialLinks` card — r22, glass
 * fill, a 42px tinted icon tile beside the name and handle, the description on
 * a 39px floor so every CTA lands on the same baseline, then the CTA pill.
 *
 * The card's own `--acc` / `--glow` / `--t1` / `--t2` drive the icon tile, the
 * hover glow and the two cursor-tracking layers; the hover state additionally
 * sets `--cta-*`, which is how the design lights the CTA pill from the card
 * rather than from the pill's own :hover — hovering anywhere on the card lights
 * the button, which is the behaviour the prototype has.
 */

interface SocialCardProps {
  channel: ResolvedCommunityChannel
}

const CARD_BASE =
  'group relative flex flex-col gap-[13px] overflow-hidden rounded-card-lg border p-[18px] no-underline shadow-[inset_0_1px_0_rgba(224,212,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_20px_38px_-30px_rgba(0,0,0,0.95)]'

/* Lift, warm the hairline, and hand the CTA pill its lit palette. */
const CARD_INTERACTIVE =
  'border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_100%)] transition-[transform,border-color,box-shadow,background] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[6px] hover:border-white/[0.17] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.085)_0%,rgba(255,255,255,0.026)_100%)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_2px_6px_rgba(0,0,0,0.45),0_30px_54px_-28px_var(--glow)] hover:[--cta-bd:rgba(178,150,255,0.5)] hover:[--cta-bg:rgba(124,88,244,0.2)] hover:[--cta-fg:#F1EAFF] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:translate-y-[-2px] active:scale-[0.99]'

/* No URL: the box stays, the lift and the lit CTA do not. */
const CARD_INERT =
  'border-white/[0.055] bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.01)_100%)]'

export default function SocialCard({ channel }: SocialCardProps) {
  const configured = Boolean(channel.href)

  return (
    <CommunityCardShell
      href={channel.href}
      /* Destination, not CTA verb: "Subscribe AI Tool Kart on YouTube" is what
         gluing the cta on produces, and the role already says "link". */
      label={`${channel.handle} on ${channel.name}`}
      reveal="stagger"
      style={toneVarsFor(channel.platform)}
      className={`${CARD_BASE} ${configured ? CARD_INTERACTIVE : CARD_INERT}`}
    >
      {/* The two cursor-tracking layers, faded in by the shared pointer hook in
          hooks/useDesignInteractions.ts. Geometry and fade come from
          [data-spot-layer] / [data-spot-edge] in styles/index.css; the fill is
          restated here only because it keys off this card's own `--t1`. */}
      {configured && (
        <>
          <span
            data-spot-layer="1"
            aria-hidden="true"
            className="[background:radial-gradient(190px_circle_at_var(--mx,50%)_var(--my,50%),var(--t1)_0%,rgba(255,255,255,0.04)_34%,transparent_64%)]"
          />
          <span data-spot-edge="1" aria-hidden="true" />
        </>
      )}

      <span className="relative flex items-center gap-[11px]">
        <span
          className={`flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[13px] border border-[var(--t2)] bg-[linear-gradient(158deg,var(--t1)_0%,rgba(255,255,255,0.03)_100%)] text-[var(--acc)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_20px_-16px_var(--glow)] ${
            configured ? '' : 'opacity-60'
          }`}
        >
          <SocialIcon platform={channel.platform} className="h-[19px] w-[19px]" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate text-[15.5px] font-semibold tracking-[-0.016em] text-[#F3F0FB]">
            {channel.name}
          </span>
          <span className="truncate text-[11.5px] text-[#726C8C]">{channel.handle}</span>
        </span>
      </span>

      {/* The 39px floor is the design's, and it is load-bearing: it holds the
          four CTA pills on one baseline when the descriptions wrap unevenly. */}
      <span className="relative min-h-[39px] text-[12.5px] leading-[1.55] text-pretty text-[#7E7899]">
        {channel.description}
      </span>

      <span
        className={`relative mt-auto inline-flex items-center gap-2 self-start rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold tracking-[-0.008em] transition-[color,border-color,background] duration-300 ${
          configured
            ? 'border-[var(--cta-bd,rgba(255,255,255,0.09))] bg-[var(--cta-bg,rgba(255,255,255,0.03))] text-[var(--cta-fg,#C9C2DE)]'
            : 'border-white/[0.06] bg-white/[0.02] text-[#5C5772]'
        }`}
      >
        {channel.cta}
        {configured ? (
          <CtaArrowIcon className="h-3 w-3" />
        ) : (
          /* Nothing to click, so no arrow promising a destination — and a word
             for the reader who cannot see that the card is quiet. */
          <span className="sr-only">— link not available yet</span>
        )}
      </span>
    </CommunityCardShell>
  )
}
