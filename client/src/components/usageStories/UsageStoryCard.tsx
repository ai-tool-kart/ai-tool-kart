import StoryAvatar from '@/components/usageStories/StoryAvatar'
import type { ResolvedUsageStory } from '@/types/usageStory'
import { storyByline } from '@/utils/usageStories'

/*
 * One card on the "How People Are Using AI" rail.
 *
 * Source: AI Tool Kart Site.dc.html, the `storiesLoop` card — a 328px column in
 * the section's rose treatment: avatar and role, then TASK, then AI SETUP as
 * chips, then the RESULT panel pinned to the bottom.
 *
 * ── What is editorial and what is the catalogue's ────────────────────────────
 *
 * Everything the reader reads here is editorial — the person, the task, the
 * outcome — EXCEPT the chip labels, which are catalogue tool names resolved from
 * the story's slugs. That split is the whole point: the story says "descript",
 * and what appears on the chip is whatever the catalogue currently calls that
 * tool.
 *
 * The chips carry no rating, no pricing and no category. The handoff shows a
 * bare name and that is right — this section is about the workflow, and
 * catalogue metadata here would turn a story into a search result.
 *
 * ── Not a link ───────────────────────────────────────────────────────────────
 *
 * The handoff's card has no click target and neither does this one. There is
 * nowhere honest to go: a story has no page, and sending a reader to the vendor
 * of the first chip would be inventing a destination the card never offered. The
 * hover lift is the design's, and it reads as "this is a card", not "this is a
 * button". Chips are `<span>`s for the same reason.
 *
 * ── The right margin is the rail's gap ───────────────────────────────────────
 *
 * `mr-[18px]` rather than a `gap` on the track. The marquee translates -50%, and
 * a flex gap leaves that landing half a gap short of the duplicate pass — a 9px
 * snap every loop. Carrying the spacing on the card makes one card box exactly
 * half-a-pass-divisible; see the note on the track in
 * pages/home/sections/HowPeopleAreUsingAISection.tsx.
 */

interface UsageStoryCardProps {
  entry: ResolvedUsageStory
  /**
   * True on the duplicated half of the marquee track.
   *
   * The loop renders every story twice. The second copy is `aria-hidden` so a
   * screen reader is told eight stories, not sixteen — it is one decorative
   * repetition, not more content.
   */
  duplicate?: boolean
}

export default function UsageStoryCard({ entry, duplicate = false }: UsageStoryCardProps) {
  const { story, tools } = entry
  const byline = storyByline(story)

  return (
    <article
      {...(duplicate ? { 'aria-hidden': true } : {})}
      data-spot="1"
      className="relative mr-[18px] flex w-[328px] flex-none flex-col gap-[18px] overflow-hidden rounded-panel border border-hairline bg-[linear-gradient(180deg,rgba(255,246,246,0.05)_0%,rgba(255,255,255,0.015)_100%)] px-[22px] py-6 shadow-[inset_0_1px_0_rgba(248,224,224,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_24px_44px_-32px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-[rgba(240,169,180,0.3)] hover:shadow-[inset_0_1px_0_rgba(252,232,232,0.28),0_2px_6px_rgba(0,0,0,0.45),0_32px_58px_-30px_rgba(198,96,116,0.5)]"
    >
      {/* The cursor-tracking wash, faded in by the shared pointer hook. Geometry
          and fade come from [data-spot-layer] in styles/index.css; only the fill
          is restated, because this section's is rose where the default is
          violet. No [data-spot-edge] — the handoff's story card has none. */}
      <span
        data-spot-layer="1"
        aria-hidden="true"
        className="[background:radial-gradient(220px_circle_at_var(--mx,50%)_var(--my,50%),rgba(240,169,180,0.13)_0%,rgba(255,255,255,0.03)_36%,transparent_66%)]"
      />

      <header className="relative flex items-center gap-[13px]">
        <StoryAvatar story={story} />
        <div className="min-w-0">
          <h3 className="text-[16.5px] font-semibold tracking-[-0.018em] text-[#F6EFEF]">
            {story.role}
          </h3>
          {byline && <p className="mt-[3px] text-[12.5px] text-[#8E8086]">{byline}</p>}
        </div>
      </header>

      <div className="relative flex flex-col gap-[7px]">
        <Label>Task</Label>
        <p className="text-[14.5px] leading-[1.5] tracking-[-0.008em] text-pretty text-[#E7DEDE]">
          {story.task}
        </p>
      </div>

      {/* Omitted entirely when nothing resolved — while the catalogue is still
          loading, and if it never arrives. A heading over no chips would be
          worse than no heading, and a chip showing a raw slug would be worse
          than both. */}
      {tools.length > 0 && (
        <div className="relative flex flex-col gap-2">
          <Label>AI setup</Label>
          <div className="flex flex-wrap gap-[6px]">
            {tools.map((tool) => (
              <span
                key={tool.id}
                className="rounded-pill border border-white/[0.09] bg-white/[0.032] px-[11px] py-[5px] text-[12px] font-medium whitespace-nowrap text-[#D6CBD0]"
              >
                {tool.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative mt-auto flex flex-col gap-[6px] rounded-tile border border-[rgba(240,169,180,0.22)] bg-[linear-gradient(180deg,rgba(240,169,180,0.11)_0%,rgba(240,169,180,0.035)_100%)] px-[15px] py-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
        <span className="text-[10.5px] tracking-[0.16em] text-[#EFB2BC] uppercase">Result</span>
        <p className="text-[14.5px] leading-[1.45] font-semibold tracking-[-0.012em] text-pretty text-[#FBF2F2]">
          {story.resultHeadline}
        </p>
        {story.resultDetail && (
          <p className="text-[13px] text-[#B79AA1]">{story.resultDetail}</p>
        )}
      </div>
    </article>
  )
}

/** The rose section labels above each block. */
function Label({ children }: { children: string }) {
  return (
    <span className="text-[10.5px] tracking-[0.16em] text-[#C98F9B] uppercase">{children}</span>
  )
}
