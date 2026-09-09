import { MembersIcon } from '@/components/community/icons'
import { COMMUNITY_PROOF } from '@/data/community'

/*
 * The proof row above the community cards.
 *
 * Source: AI Tool Kart Site.dc.html — the r24 pink-washed bar: a 50px glyph
 * tile, the headline and its sentence, then the overlapping member circles and
 * the count pill, pushed to the far end by `justify-content:space-between`.
 *
 * ── The circles carry no portraits, and will not get any here ────────────────
 *
 * The handoff draws five `image-slot shape="circle"` placeholders. They stay
 * placeholders: a stock face standing in for a community member is the one
 * detail that turns an illustrative row into a claim about real people, and
 * there is no members table to draw from. So this renders the handoff's own
 * empty treatment — a neutral disc with the dark ring that makes the overlap
 * read — marked `aria-hidden`, because a screen reader gains nothing from five
 * announcements of nothing. Initials were the other option and were rejected
 * for the same reason: invented initials are invented people.
 *
 * ── The count is not measured ────────────────────────────────────────────────
 *
 * "+186K members" is editorial copy from data/community.ts, not a number this
 * app can compute. See the comment there.
 */

export default function CommunityProofRow() {
  return (
    <div
      data-reveal="0.05"
      className="relative mt-7 flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-panel border border-[rgba(240,169,192,0.22)] bg-[linear-gradient(120deg,rgba(226,116,152,0.13)_0%,rgba(160,90,220,0.08)_45%,rgba(255,255,255,0.016)_100%)] px-[26px] py-[22px] shadow-[inset_0_1px_0_rgba(252,228,238,0.2),0_2px_6px_rgba(0,0,0,0.45),0_32px_62px_-40px_rgba(198,80,130,0.55)]"
    >
      <div className="relative flex min-w-0 items-center gap-4">
        <span className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-[17px] border border-[rgba(240,169,192,0.3)] bg-[linear-gradient(158deg,rgba(240,160,186,0.24),rgba(255,255,255,0.03))] text-[#F7D5E2] shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_14px_28px_-18px_rgba(198,80,130,0.9)]">
          <MembersIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <div className="text-[17.5px] font-semibold tracking-[-0.018em] text-[#FBF0F4]">
            {COMMUNITY_PROOF.headline}
          </div>
          <p className="mt-[5px] text-[13.5px] leading-[1.55] text-pretty text-[#A6929C]">
            {COMMUNITY_PROOF.description}
          </p>
        </div>
      </div>

      <div className="relative flex items-center gap-3">
        {/* The overlap is a negative left margin on every disc, so the first one
            gets a matching left pad rather than hanging off the row. */}
        <div aria-hidden="true" className="flex items-center pl-[11px]">
          {Array.from({ length: COMMUNITY_PROOF.avatarCount }, (_unused, index) => (
            <span
              key={index}
              className="-ml-[11px] h-10 w-10 rounded-full border-2 border-[rgba(24,14,22,0.9)] bg-white/[0.05] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.9)]"
            />
          ))}
        </div>
        <span className="rounded-pill border border-[rgba(240,169,192,0.3)] bg-[rgba(226,116,152,0.16)] px-[14px] py-2 text-[13px] font-semibold whitespace-nowrap text-[#F7DCE6]">
          {COMMUNITY_PROOF.memberCount}
        </span>
      </div>
    </div>
  )
}
