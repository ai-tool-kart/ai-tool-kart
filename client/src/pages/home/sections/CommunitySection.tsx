import CommunityProofRow from '@/components/community/CommunityProofRow'
import DiscordCard from '@/components/community/DiscordCard'
import SocialCard from '@/components/community/SocialCard'
import { COMMUNITY_PROOF, DISCORD_CHANNEL, SOCIAL_CHANNELS } from '@/data/community'
import { resolveCommunityChannel, resolveCommunityChannels } from '@/utils/community'

/*
 * "Community" — the social hub.
 *
 * Source: AI Tool Kart Site.dc.html, `id="community"`. It follows Blog &
 * Insights in the final design, and does so here. A pink/mauve band with a soft
 * bloom behind it: centred header, the proof row, then the Discord feature card
 * spanning the grid with four compact social cards beneath it.
 *
 * ── What this section does ───────────────────────────────────────────────────
 *
 * It sends people to five external accounts. That is the whole behaviour: no
 * fetching, no state, no server. Every destination comes from COMMUNITY_LINKS
 * in data/community.ts, which is the ONE place any of these URLs is written —
 * the footer's social rail reads the same object. Nothing in this file, and
 * nothing in any component under components/community/, contains a URL.
 *
 * A channel with no usable URL configured still renders its card, in place, but
 * not as a link. See utils/community.ts and CommunityCardShell.
 *
 * ── The anchor ───────────────────────────────────────────────────────────────
 *
 * `id="community"` is the design's, and `scroll-mt` clears the fixed header the
 * way the handoff's `scroll-margin-top:110px` does. Nothing links to it yet:
 * the header's Community nav item still points at `/`, and the assistant's
 * "Join Our Community" cluster is still absent. Both are their own change.
 *
 * ── The grid ─────────────────────────────────────────────────────────────────
 *
 * Explicit tracks — 1 / 2 / 4 — rather than the design's
 * `repeat(auto-fit,minmax(240px,1fr))`.
 *
 * The two layouts agree at the sizes the handoff actually shows: four abreast
 * at full width, one column on a phone. They disagree between roughly 816px and
 * 1072px, where the auto track floor fits exactly three columns and the fourth
 * card drops onto a row of its own at a third of the width, two empty tracks
 * beside it. Under a Discord card that spans the full row, that reads as a
 * mistake. Four cards want an even split, and 2x2 is what a tablet should get.
 *
 * The Discord card spans whatever the count is via `col-span-full`, so it needs
 * no breakpoints of its own.
 */

export default function CommunitySection() {
  const discord = resolveCommunityChannel(DISCORD_CHANNEL)
  const socials = resolveCommunityChannels(SOCIAL_CHANNELS)

  return (
    <section id="community" className="relative scroll-mt-[110px] pt-[92px] pb-[88px]">
      {/* The mauve band, its hairlines, and the pink bloom behind the header. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(30,14,28,0)_0%,rgba(30,14,28,0.72)_14%,rgba(30,14,28,0.72)_86%,rgba(30,14,28,0)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] bottom-0 left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[34%] left-1/2 h-[340px] w-[min(900px,92%)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(58%_58%_at_50%_50%,rgba(226,116,152,0.15)_0%,rgba(160,90,220,0.06)_46%,transparent_74%)] blur-[34px]"
      />

      <div className="relative mx-auto max-w-site px-8">
        <div data-reveal="0" className="text-center">
          <div className="text-[11.5px] tracking-[0.2em] text-[#F0A9C0] uppercase">
            Community
          </div>
          <h2 className="mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
            Join the people testing these tools
          </h2>
          {/* Carries an unverified member count; the copy lives in data/community.ts. */}
          <p className="mx-auto mt-[14px] max-w-[58ch] text-[15px] leading-[1.62] tracking-[-0.006em] text-pretty text-muted-dim">
            {COMMUNITY_PROOF.intro}
          </p>
        </div>

        <CommunityProofRow />

        <div className="relative mt-[26px] grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DiscordCard channel={discord} />
          {socials.map((channel) => (
            <SocialCard key={channel.platform} channel={channel} />
          ))}
        </div>
      </div>
    </section>
  )
}
