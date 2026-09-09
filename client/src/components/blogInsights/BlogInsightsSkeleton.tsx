/*
 * Blog & Insights while WordPress is answering.
 *
 * The section depends on a CMS that may be on another host, so the placeholders
 * hold the loaded layout's geometry — the featured panel's two tracks and its
 * media, then two 16:9 tiles — and the section does not jump when the posts land.
 *
 * ── Why the bar heights are what they are ────────────────────────────────────
 *
 * They are MEASURED off the loaded cards, not guessed, and they are grouped the
 * way the real text is: a title is three line boxes inside one block, not three
 * bars spaced on the card's own 16px rhythm. Built the loose way the panel came
 * out 35px short and the page settled visibly when the posts arrived.
 *
 * The target is the typical card, because the exact one is unknowable: these
 * are CMS headlines, and a two-line title and a three-line title genuinely are
 * different heights. The featured copy column is modelled on a three-line title
 * with a three-line excerpt (341px against the loaded 344px), and the tiles on
 * a two-line title with a one-line excerpt (178px, which is what the taller of
 * the two loaded tiles measures). Both are inside a few pixels, which is as
 * close as content-driven height allows.
 *
 * Tailwind's `animate-pulse` is used rather than a bespoke keyframe; the global
 * prefers-reduced-motion override in styles/animations.css neutralises it.
 */

const BAR = 'rounded-[6px] bg-white/[0.055]'

/** A block of `lines` text lines: bar height and gap are the real line box. */
function Lines({ count, height, gap }: { count: number; height: number; gap: number }) {
  return (
    <div className="flex flex-col" style={{ gap: `${gap}px` }}>
      {Array.from({ length: count }, (_unused, index) => (
        <div
          key={index}
          className={BAR}
          style={{ height: `${height}px`, width: index === count - 1 ? '68%' : '100%' }}
        />
      ))}
    </div>
  )
}

/** The lead panel's placeholder: same two tracks, same 320px media floor. */
export function InsightFeaturedSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid animate-pulse grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] overflow-hidden rounded-panel-lg border border-[rgba(229,196,140,0.14)] bg-[linear-gradient(140deg,rgba(214,164,84,0.07)_0%,rgba(255,250,242,0.03)_38%,rgba(255,255,255,0.012)_100%)]"
    >
      <div className="min-h-[320px] bg-white/[0.035]" />
      <div className="flex flex-col justify-center gap-4 px-[clamp(22px,3vw,38px)] py-10">
        {/* Badge + reading time. */}
        <div className="h-[23px] w-[190px] rounded-pill bg-white/[0.055]" />
        {/* Title — 28px type, 1.2 leading, three lines. */}
        <Lines count={3} height={26} gap={11} />
        {/* Excerpt — 14.5px type, 1.62 leading, three lines. */}
        <Lines count={3} height={15} gap={12} />
        <div className={`${BAR} h-[21px] w-[124px]`} />
      </div>
    </div>
  )
}

/** One secondary tile. */
function InsightCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse flex-col overflow-hidden rounded-card-lg border border-white/[0.055] bg-[linear-gradient(180deg,rgba(255,250,242,0.03)_0%,rgba(255,255,255,0.012)_100%)]"
    >
      <div className="aspect-[16/9] w-full bg-white/[0.035]" />
      <div className="flex flex-col gap-[11px] px-5 pt-[18px] pb-5">
        {/* Category pill + reading time. */}
        <div className="h-[22px] w-[150px] rounded-pill bg-white/[0.055]" />
        {/* Title — 17px type, 1.32 leading, two lines. */}
        <Lines count={2} height={19} gap={7} />
        {/* Excerpt — 13px type, 1.6 leading, one line. */}
        <div className={`${BAR} h-[21px] w-full`} />
        <div className={`${BAR} h-[19px] w-[58px]`} />
      </div>
    </div>
  )
}

/**
 * The secondary row's placeholders, as a fragment.
 *
 * Rendered inside the section's own grid so the tracks they occupy are the
 * tracks the cards land in. The section owns the `role="status"` announcement.
 */
export default function BlogInsightsSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_unused, index) => (
        <InsightCardSkeleton key={index} />
      ))}
    </>
  )
}
