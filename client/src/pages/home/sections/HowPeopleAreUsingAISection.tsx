import UsageStoriesSkeleton from '@/components/usageStories/UsageStoriesSkeleton'
import UsageStoryCard from '@/components/usageStories/UsageStoryCard'
import { useUsageStories } from '@/hooks/useUsageStories'
import type { ResolvedUsageStory } from '@/types/usageStory'

/*
 * "How People Are Using AI" — the story rail.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="How people use AI"`. It
 * follows Recently Added Tools in the final design, and does so here. A rose-lit
 * band holding a continuously travelling row of case-study cards.
 *
 * ── What this section is, and what it must not pretend to be ─────────────────
 *
 * The stories are ILLUSTRATIVE PRODUCT-DEMO CONTENT. The people, the places and
 * the numbers are written, not collected. They come from the handoff so the
 * section could be built, and they sit in one seed file behind
 * GET /api/usage-stories so replacing them with real, sourced stories is a data
 * change and nothing more.
 *
 * The one addition to the handoff is the line saying so, under the section's own
 * subtitle. The design's copy — "a person, the task in front of them, the tools
 * they combined, and what changed" — reads as reportage, and eight invented
 * customers with invented percentages presented that way is a fabricated
 * endorsement, whatever the intent. The note is small, in the section's own
 * muted style, and costs the design nothing. It comes out the day the stories
 * are real.
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   HowPeopleAreUsingAISection
 *     └─ useUsageStories
 *          ├─ services/usageStories.ts ─ GET /api/usage-stories  (cached once)
 *          └─ useToolIndex ─────────── GET /api/tools            (already read)
 *
 * One new request for the section. Tool chips resolve from the catalogue index
 * three earlier sections have already loaded — never a request per tool.
 *
 * ── Failure ──────────────────────────────────────────────────────────────────
 *
 * No stories, no section: it renders nothing and the page closes over it, as
 * Featured and Recently Added do. There is no editorial content here that
 * survives the request — the stories ARE the content. A catalogue failure is
 * different and much cheaper: the cards keep their people, tasks and results and
 * simply lose their chips.
 */

/** The design's rail: `akMarquee` over a duplicated track, 46s, linear. */
const MARQUEE = '[animation:akMarquee_46s_linear_infinite]'

/** Placeholder cards while the stories load. Matches the seeded set's length. */
const SKELETON_COUNT = 8

interface HowPeopleAreUsingAISectionProps {
  /** Heading override. Defaults to the design's own wording. */
  heading?: string
}

export default function HowPeopleAreUsingAISection({
  heading = 'How People Are Using AI',
}: HowPeopleAreUsingAISectionProps = {}) {
  const { stories, isLoading, failed } = useUsageStories()

  if (failed || (!isLoading && stories.length === 0)) return null

  return (
    <section className="relative pt-[92px] pb-[88px]">
      {/* The rose band, and the hairlines that open and close it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(32,16,18,0)_0%,rgba(32,16,18,0.68)_14%,rgba(32,16,18,0.68)_86%,rgba(32,16,18,0)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-[6%] left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] bottom-0 left-[6%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)]"
      />

      <div className="relative mx-auto max-w-site px-8">
        <div data-reveal="0" className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11.5px] tracking-[0.2em] text-[#F0A9B4] uppercase">
              Real setups
            </div>
            <h2 className="mt-3 text-[clamp(30px,3.2vw,40px)] leading-[1.08] font-bold tracking-[-0.032em] text-pretty text-ink">
              {heading}
            </h2>
            <p className="mt-[14px] max-w-[58ch] text-[15px] leading-[1.62] tracking-[-0.006em] text-pretty text-muted-dim">
              Not screenshots of features &mdash; a person, the task in front of them, the tools
              they combined, and what changed.
            </p>
            {/*
             * The disclosure. Not in the handoff; see the note at the top of
             * this file for why it is here and when it goes.
             */}
            <p className="mt-[10px] max-w-[58ch] text-[12.5px] leading-[1.5] text-[#7C6E73]">
              Illustrative setups written to show how the tools fit together &mdash; not
              customer testimonials.
            </p>
          </div>
        </div>
      </div>

      {/*
       * The marquee sits OUTSIDE the 1240px container, edge to edge, exactly as
       * the handoff has it — the mask is what ends the rail, not a margin.
       *
       * `[data-marquee]` / `[data-marquee-track]` are the handoff's own pair,
       * read by the pause-on-hover rule in styles/animations.css. Hovering
       * anywhere on the rail stops it, which is what makes a card readable; on
       * touch there is no hover, so the rail simply keeps running, and nothing
       * here traps a swipe because the track is not a scroll container.
       */}
      <div
        data-marquee="1"
        className="relative mt-[30px] mb-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent_0,#000_5%,#000_95%,transparent_100%)]"
      >
        <div
          data-marquee-track="1"
          {...(isLoading ? { role: 'status', 'aria-label': 'Loading usage stories' } : {})}
          /*
           * NO `gap` on this track, deliberately — the 18px lives on each card
           * as a right margin instead (UsageStoryCard).
           *
           * A flex gap does not divide evenly at -50%. With N cards per pass the
           * track holds 2N cards but only 2N-1 gaps, so half the track width
           * lands half a gap short of where the duplicate pass begins, and the
           * loop snaps by 9px every cycle. Measured on the handoff's own values:
           * half of 5518px is 2759px, the ninth card starts at 2768px.
           *
           * Giving every card a trailing margin makes one card box exactly
           * 328+18, so a pass is exactly half the track and -50% lands on the
           * seam. The visible spacing is identical, including between the last
           * card of one pass and the first of the next; the only difference is a
           * trailing 18px after the final duplicate, which the wrap never
           * reaches.
           */
          className={`flex w-max items-stretch pt-[6px] pb-[45px] will-change-transform ${
            isLoading ? '' : MARQUEE
          }`}
        >
          {isLoading ? (
            <UsageStoriesSkeleton count={SKELETON_COUNT} />
          ) : (
            /*
             * The loop: the same set rendered twice, translated to -50%. At the
             * moment the keyframe wraps, the track's second half is sitting
             * exactly where its first half began, so there is nothing to see.
             *
             * The duplicate is aria-hidden — to a screen reader this is eight
             * stories repeated for effect, not sixteen stories.
             */
            <>
              <Track stories={stories} />
              <Track stories={stories} duplicate />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * One pass of the story set.
 *
 * A fragment rather than a wrapper: both halves are direct children of the
 * flex track, so the 18px gap between the last card of one pass and the first
 * of the next is the same gap as everywhere else. A wrapping element would make
 * the seam the one place the rhythm breaks — and the seam is precisely where a
 * reader would notice it.
 */
function Track({
  stories,
  duplicate = false,
}: {
  stories: ResolvedUsageStory[]
  duplicate?: boolean
}) {
  return (
    <>
      {stories.map((entry) => (
        <UsageStoryCard key={entry.story.id} entry={entry} duplicate={duplicate} />
      ))}
    </>
  )
}
