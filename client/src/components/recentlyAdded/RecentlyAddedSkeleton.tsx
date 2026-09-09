/*
 * The "Recently Added Tools" rail while the catalogue is being read.
 *
 * Holds the rail's exact geometry — the same 232px columns, the same 16px gap,
 * the same 5:4 media box, the same paddings — so the section does not resize or
 * jump when the tools arrive. It is placed inside the real scroll container by
 * the section, which is what keeps the mask, the arrows and the scroll position
 * behaving identically before and after the read.
 *
 * The bars use the same `akSheen` sweep as the Browse grid's skeleton, so
 * loading looks like one idea across the app rather than two.
 */

function SkeletonBar({ width, delay }: { width: string; delay: string }) {
  return (
    <span
      style={{ width }}
      className="relative block h-[10px] overflow-hidden rounded-[5px] bg-white/[0.05]"
    >
      <span
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg,transparent,rgba(160,190,255,0.2),transparent)',
          animation: `akSheen 1.7s ease-in-out ${delay} infinite`,
        }}
      />
    </span>
  )
}

/*
 * One placeholder card.
 *
 * The row heights are RecentToolCard's own, measured rather than guessed: the
 * name's line box is 19.5px, the three-line clamped description 56.3px, the
 * rating row 15px and the pill row 24px, over a 5:4 media box. Each thin bar
 * therefore sits inside a row of the real element's height instead of being the
 * row — which is what keeps the card 358px tall before and after the tools land,
 * so the section does not settle downward as it resolves.
 */
function RecentToolCardSkeleton() {
  return (
    <div className="flex w-[232px] flex-none flex-col overflow-hidden rounded-card-lg border border-hairline bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.014)_100%)] px-4 pt-[18px] pb-4">
      <div className="relative aspect-[5/4] w-full overflow-hidden rounded-tile border border-white/[0.1] bg-white/[0.035]">
        <span
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg,transparent,rgba(160,190,255,0.12),transparent)',
            animation: 'akSheen 1.9s ease-in-out infinite',
          }}
        />
      </div>
      {/* The name line. */}
      <div className="mt-4 flex h-[19.5px] items-center">
        <span className="block h-[13px] w-[62%] rounded-[5px] bg-white/[0.05]" />
      </div>
      {/* The description, at the clamp's full three lines. */}
      <div className="mt-[5px] flex h-[56.3px] flex-col justify-center gap-[7px]">
        <SkeletonBar width="94%" delay="0s" />
        <SkeletonBar width="88%" delay=".08s" />
        <SkeletonBar width="64%" delay=".16s" />
      </div>
      {/* The rating row. */}
      <div className="mt-[14px] flex h-[15px] items-center">
        <SkeletonBar width="52%" delay=".24s" />
      </div>
      {/* The pricing and category pills. */}
      <div className="mt-[14px] flex h-6 items-center gap-[6px]">
        <span className="h-6 w-[64px] rounded-pill bg-white/[0.04]" />
        <span className="h-6 w-[58px] rounded-pill bg-white/[0.04]" />
      </div>
    </div>
  )
}

/**
 * A rail of placeholders, returned as a fragment.
 *
 * Deliberately NOT wrapped in a container of its own: it renders INSIDE the
 * section's real scroll element, so the rail it fills is the same rail the
 * tools land in. A wrapper would nest a flex row inside a flex row and collapse
 * the gap. The section owns the `role="status"` announcement for the wait.
 */
export default function RecentlyAddedSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_unused, index) => (
        <RecentToolCardSkeleton key={index} />
      ))}
    </>
  )
}
