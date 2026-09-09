/*
 * The story rail while the content is being read.
 *
 * Holds the rail's geometry — 328px columns, the 18px gap, the avatar circle,
 * the three blocks and the result panel — so the section does not resize when
 * the stories arrive.
 *
 * Nothing here moves. The rail it stands in is about to be a continuous
 * animation, and a sheen sweeping across cards that are themselves about to
 * start travelling is two motions competing for the same attention. The Browse
 * grid can afford a shimmer because it is still; this cannot.
 */

const BAR = 'block rounded-[5px] bg-white/[0.05]'

/*
 * One placeholder card.
 *
 * The four block heights are UsageStoryCard's own, measured rather than
 * guessed: header 60px (the avatar sets it), task 41.8px, AI setup 47.5px, and
 * a 113px result panel — the height of the panel whose headline runs to two
 * lines, which is the card every other card in the rail stretches to match.
 *
 * With the card's own 18px block gaps and 24px vertical padding that comes to
 * 366.3px, exactly what the loaded rail measures, so the section does not settle
 * when the stories arrive. Each thin bar sits INSIDE a block of the real
 * element's height rather than being the block.
 */
function UsageStoryCardSkeleton() {
  return (
    <div className="mr-[18px] flex w-[328px] flex-none flex-col gap-[18px] overflow-hidden rounded-panel border border-hairline bg-[linear-gradient(180deg,rgba(255,246,246,0.04)_0%,rgba(255,255,255,0.012)_100%)] px-[22px] py-6">
      {/* Avatar and role — 60px, set by the circle itself. */}
      <div className="flex items-center gap-[13px]">
        <span className="h-[60px] w-[60px] flex-none rounded-full border border-[rgba(248,224,224,0.16)] bg-white/[0.04]" />
        <div className="flex min-w-0 flex-col gap-[7px]">
          <span className={`${BAR} h-[15px] w-[112px]`} />
          <span className={`${BAR} h-[11px] w-[84px]`} />
        </div>
      </div>

      {/* Task — label and one line. */}
      <div className="flex h-[41.8px] flex-col justify-between">
        <span className={`${BAR} h-[9px] w-[38px]`} />
        <span className={`${BAR} h-[11px] w-[88%]`} />
      </div>

      {/* AI setup — label and one row of chips. */}
      <div className="flex h-[47.5px] flex-col justify-between">
        <span className={`${BAR} h-[9px] w-[58px]`} />
        <div className="flex gap-[6px]">
          <span className="h-[26.5px] w-[78px] rounded-pill bg-white/[0.04]" />
          <span className="h-[26.5px] w-[92px] rounded-pill bg-white/[0.04]" />
          <span className="h-[26.5px] w-[70px] rounded-pill bg-white/[0.04]" />
        </div>
      </div>

      {/* Result panel — kept at full strength, because it is the card's anchor
          and a faded one would make the skeleton look bottom-light. */}
      <div className="mt-auto flex h-[113px] flex-col justify-center gap-[6px] rounded-tile border border-[rgba(240,169,180,0.16)] bg-[linear-gradient(180deg,rgba(240,169,180,0.08)_0%,rgba(240,169,180,0.025)_100%)] px-[15px] py-[14px]">
        <span className={`${BAR} h-[9px] w-[46px]`} />
        <span className={`${BAR} h-[13px] w-[86%]`} />
        <span className={`${BAR} h-[13px] w-[54%]`} />
        <span className={`${BAR} mt-[2px] h-[11px] w-[68%]`} />
      </div>
    </div>
  )
}

/**
 * A rail of placeholders, returned as a fragment.
 *
 * Rendered inside the section's own track element so the row it fills is the row
 * the stories land in. The section owns the `role="status"` announcement.
 */
export default function UsageStoriesSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_unused, index) => (
        <UsageStoryCardSkeleton key={index} />
      ))}
    </>
  )
}
