import { useRef, type FocusEvent } from 'react'
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
  const railRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  /*
   * Keyboard focus on a linked card, which the rail was never built for.
   *
   * Only the FIRST pass is focusable (the duplicate is aria-hidden, its links
   * tabIndex -1), and by the time anyone tabs in, the loop has usually carried
   * that pass off the left edge — what is on screen is the duplicate. Pausing
   * alone (the :focus-within rule) would freeze the rail with the focused card
   * out of sight, and the browser cannot scroll it back: it is left of the
   * rail, and an overflow-hidden box does not scroll below zero.
   *
   * So when a focused card is not fully inside the rail (less the 5% edge
   * mask), the running marquee animation is SEEKED to the moment that card
   * sits at the left. The :focus-within rule holds it there, and when focus
   * leaves, the CSS unpauses it and the loop carries on from that exact spot —
   * no jump. Pointer users never reach this: hover pauses the rail in place.
   *
   * Two rules keep the CSS in charge:
   *
   *   ONLY `currentTime` IS SET. Calling the animation's own pause() or play()
   *   detaches a CSS animation from `animation-play-state` for good, which
   *   would quietly break the hover pause from then on.
   *
   *   THE LOOP ONLY MOVES LEFT. Its range is translateX(0) to -50%, so the
   *   first card can come no further right than the rail's edge: it sits
   *   under the edge mask's first 5%. Every other card clears it.
   *
   * With reduced motion there is no running animation to seek (the global
   * override finishes it at once), so the track is positioned by hand instead
   * and put back when focus leaves. Nothing loops there, so nothing jumps.
   */
  const revealFocusedCard = (event: FocusEvent<HTMLDivElement>) => {
    const rail = railRef.current
    const track = trackRef.current
    const card = event.target instanceof HTMLElement ? event.target.closest('a[href]') : null
    if (!rail || !track || !card) return
    // Focusing an element off to the right makes the browser scroll this
    // overflow-hidden rail to it before the event arrives, and that scroll
    // outlives the focus: once the loop resumes, the offset pushes the track
    // past its own end and the rail shows blank space. The rail must only ever
    // move by its animation, so the scroll is undone before measuring.
    rail.scrollLeft = 0
    const railBox = rail.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    const inset = railBox.width * 0.05
    if (cardBox.left >= railBox.left + inset && cardBox.right <= railBox.right - inset) return
    // Both boxes carry the track's current transform, so the difference is the
    // card's untransformed position along the track.
    const offset = cardBox.left - track.getBoundingClientRect().left
    const target = inset - offset

    const loop = runningMarquee(track)
    if (loop) {
      // Flush style first so the :focus-within pause is already in effect and
      // the seeked frame is the one that holds.
      void getComputedStyle(track).animationPlayState
      const half = track.scrollWidth / 2
      const x = Math.min(0, Math.max(target, -half))
      loop.animation.currentTime = (-x / half) * loop.duration
      return
    }

    // Reduced motion: nothing is running, so place the track directly.
    // Unclamped: for the first card the gap that opens on the left is inside
    // the edge mask, which is transparent anyway.
    track.style.animation = 'none'
    track.style.transform = `translateX(${target}px)`
  }

  const resumeRail = (event: FocusEvent<HTMLDivElement>) => {
    const rail = railRef.current
    const track = trackRef.current
    if (!rail || !track || rail.contains(event.relatedTarget as Node | null)) return
    rail.scrollLeft = 0
    // Only the reduced-motion path sets these; the seek needs no undoing —
    // the CSS unpauses the animation from where it was left.
    track.style.animation = ''
    track.style.transform = ''
  }

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
        ref={railRef}
        data-marquee="1"
        onFocus={revealFocusedCard}
        onBlur={resumeRail}
        className="relative mt-[30px] mb-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent_0,#000_5%,#000_95%,transparent_100%)]"
      >
        <div
          ref={trackRef}
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
 * The track's marquee animation, if one is running and seekable.
 *
 * Undefined under reduced motion, where the global override finishes the
 * animation immediately and there is no loop to seek.
 */
function runningMarquee(track: HTMLElement): { animation: Animation; duration: number } | undefined {
  const animation = track
    .getAnimations()
    .find((candidate) => candidate instanceof CSSAnimation && candidate.animationName === 'akMarquee')
  if (!animation || animation.playState === 'finished') return undefined
  const duration = animation.effect?.getTiming().duration
  if (typeof duration !== 'number' || duration <= 0) return undefined
  return { animation, duration }
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
