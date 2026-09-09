/*
 * The heading above one date group.
 *
 * Source: AI Tool Kart Site.dc.html — a lit dot, the uppercase label, a
 * gradient rule that takes the remaining width, and the group's count on the
 * right.
 *
 * The label is computed from `addedAt` by utils/launchDates.ts and is never
 * stored on a record; the count is the group's own length. Neither is editorial.
 */

/*
 * The grid one date group's cards sit in.
 *
 * `auto-fill`, not the `auto-fit` that Browse's GRID_CLASS uses. The two differ
 * on exactly one case and this page hits it constantly: with fewer cards than
 * columns, `auto-fit` collapses the empty tracks and lets the survivors absorb
 * the width, so a month that saw one launch renders it as a single card
 * stretched across 1250px with a 132px media band on top. Browse never sees
 * that — a result set is either many cards or the empty state — but a launch
 * group of one is ordinary here.
 *
 * The `min(268px,100%)` floor is the same guard the blog grids carry, so the
 * track cannot outgrow a narrow viewport.
 */
export const LAUNCH_GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(min(268px,100%),1fr))] gap-5'

interface LaunchGroupHeadingProps {
  label: string
  count: number
}

export default function LaunchGroupHeading({ label, count }: LaunchGroupHeadingProps) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="inline-flex items-center gap-[9px] text-[11.5px] font-bold tracking-[0.18em] whitespace-nowrap text-[#C9B6FF] uppercase">
        <span
          aria-hidden="true"
          className="h-[5px] w-[5px] flex-none rounded-full bg-[#B79BFF] shadow-[0_0_9px_2px_rgba(167,139,250,0.8)]"
        />
        {label}
      </h2>
      <span
        aria-hidden="true"
        className="h-px flex-auto bg-[linear-gradient(90deg,rgba(178,150,255,0.3),rgba(255,255,255,0.05)_42%,transparent)]"
      />
      <span className="text-[12.5px] whitespace-nowrap text-[#615C7A]">
        {count} {count === 1 ? 'tool' : 'tools'}
      </span>
    </div>
  )
}
