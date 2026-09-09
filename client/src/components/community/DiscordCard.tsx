import CommunityCardShell from '@/components/community/CommunityCardShell'
import { toneVarsFor } from '@/components/community/communityTone'
import { DiscordIcon } from '@/components/community/icons'
import type { ResolvedCommunityChannel } from '@/types/community'

/*
 * The Discord feature card — the section's primary call to action.
 *
 * Source: AI Tool Kart Site.dc.html, the `grid-column:1/-1` anchor at the head
 * of the community grid: a 24px-radius panel drawn with a padding-box /
 * border-box gradient pair (CSS has no other way to express a gradient border),
 * a lit hairline across its top edge, then the 60px mark, the name with its
 * "Start here" badge, the description, and the pink CTA capsule.
 *
 * ── The colour mix is the handoff's, not a mistake ───────────────────────────
 *
 * The card carries the section's PINK tone on its icon tile and spotlight, but
 * its border gradient, its badge and its hover bloom are the site's violet. That
 * is how the prototype draws it: the card belongs to the community band while
 * still reading as the page's primary CTA surface, the same treatment the
 * "Add to the Kart" banner uses. Reproduced as-is rather than harmonised.
 *
 * `handle` carries the badge text ("Start here") rather than an account name,
 * because that is what the design puts in that slot for this one card. It is
 * layout language, not a flag on anything.
 */

interface DiscordCardProps {
  channel: ResolvedCommunityChannel
}

/* The design's gradient border: fill on padding-box, border on border-box. */
const CARD_BACKGROUND =
  'linear-gradient(180deg,rgba(14,11,24,0.94) 0%,rgba(9,7,16,0.96) 100%) padding-box,' +
  'linear-gradient(158deg,rgba(232,222,255,0.5) 0%,rgba(178,150,255,0.2) 26%,rgba(255,255,255,0.045) 58%,rgba(206,186,255,0.3) 100%) border-box'

export default function DiscordCard({ channel }: DiscordCardProps) {
  const configured = Boolean(channel.href)

  return (
    <CommunityCardShell
      href={channel.href}
      label={`${channel.cta} on ${channel.name}`}
      reveal="stagger"
      style={{ ...toneVarsFor(channel.platform), background: CARD_BACKGROUND }}
      className={`group relative col-span-full flex flex-wrap items-center gap-6 overflow-hidden rounded-panel border border-transparent p-[clamp(20px,2.2vw,28px)] no-underline shadow-[inset_0_1px_0_rgba(226,214,255,0.16),0_2px_6px_rgba(0,0,0,0.5),0_30px_60px_-40px_rgba(0,0,0,0.9),0_34px_80px_-54px_rgba(72,34,180,0.6)] ${
        configured
          ? 'transition-[transform,box-shadow] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.28),0_2px_6px_rgba(0,0,0,0.5),0_34px_68px_-34px_rgba(0,0,0,0.95),0_40px_90px_-46px_rgba(124,88,244,0.85)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent'
          : ''
      }`}
    >
      {configured && (
        <span
          data-spot-layer="1"
          aria-hidden="true"
          className="z-[1] [background:radial-gradient(320px_circle_at_var(--mx,50%)_var(--my,50%),var(--t1)_0%,rgba(255,255,255,0.035)_36%,transparent_66%)]"
        />
      )}
      {/* The lit hairline across the card's upper edge. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[12%] left-[12%] h-px bg-[linear-gradient(90deg,transparent,rgba(232,222,255,0.6),transparent)]"
      />

      <span
        className={`relative flex h-[60px] w-[60px] flex-none items-center justify-center rounded-[19px] border border-[var(--t2)] bg-[linear-gradient(158deg,var(--t1)_0%,rgba(255,255,255,0.03)_100%)] text-[#E3D8FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_14px_28px_-18px_rgba(124,88,244,0.95)] ${
          configured ? '' : 'opacity-60'
        }`}
      >
        <DiscordIcon className="h-7 w-7" />
      </span>

      <span className="relative flex min-w-0 flex-[1_1_320px] flex-col gap-[7px]">
        <span className="flex flex-wrap items-center gap-[10px]">
          <span className="text-[20px] font-semibold tracking-[-0.018em] text-ink">
            {channel.name}
          </span>
          <span className="rounded-[6px] border border-[rgba(178,150,255,0.36)] bg-[rgba(124,90,246,0.16)] px-[9px] py-[3px] text-[9.5px] font-bold tracking-[0.14em] text-[#C6B2FF] uppercase">
            {channel.handle}
          </span>
        </span>
        <span className="max-w-[56ch] text-[14px] leading-[1.6] text-pretty text-muted-dim">
          {channel.description}
        </span>
      </span>

      {configured ? (
        <span className="relative inline-flex h-12 flex-none items-center gap-[9px] rounded-pill border border-white/[0.24] bg-[linear-gradient(180deg,#F0A6C6_0%,#D2649E_48%,#9C3F82_100%)] px-[22px] text-[14.5px] font-semibold tracking-[-0.008em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_16px_34px_-14px_rgba(214,90,140,0.9)] transition-shadow duration-[350ms]">
          {channel.cta}
          <span
            aria-hidden="true"
            className="text-[15px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      ) : (
        /* Same capsule geometry so the card does not reflow, drained of the
           gradient that says "press me". */
        <span className="relative inline-flex h-12 flex-none items-center rounded-pill border border-white/[0.08] bg-white/[0.03] px-[22px] text-[14.5px] font-semibold tracking-[-0.008em] text-[#5C5772]">
          {channel.cta}
          <span className="sr-only"> — link not available yet</span>
        </span>
      )}
    </CommunityCardShell>
  )
}
