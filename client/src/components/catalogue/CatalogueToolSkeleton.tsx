import { GRID_CLASS } from '@/components/catalogue/CatalogueToolGrid'

/*
 * The loading state for the results grid.
 *
 * A skeleton rather than a spinner, and one that traces the real card — 132px
 * media band, then title, tagline and footer bars at the card's own rhythm — so
 * the grid does not reflow when results replace it. The sheen is the same
 * `akSheen` the assistant's plan panel uses, so loading looks like one idea
 * across the app rather than two.
 *
 * The count matches the page size, so the first paint is the shape of the answer
 * that is coming.
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
          background: 'linear-gradient(90deg,transparent,rgba(196,168,255,0.2),transparent)',
          animation: `akSheen 1.7s ease-in-out ${delay} infinite`,
        }}
      />
    </span>
  )
}

/** One placeholder card. Exported so a "load more" page can append a few. */
export function CatalogueToolCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col overflow-hidden rounded-panel border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.014)_100%)]"
    >
      <div className="relative h-[132px] overflow-hidden border-b border-white/[0.06] bg-[linear-gradient(158deg,rgba(167,139,250,0.1)_0%,rgba(18,14,32,0.72)_62%,rgba(12,9,22,0.9)_100%)]">
        <span
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg,transparent,rgba(196,168,255,0.12),transparent)',
            animation: 'akSheen 1.9s ease-in-out infinite',
          }}
        />
      </div>
      <div className="flex flex-auto flex-col gap-[11px] p-[18px]">
        <div className="flex flex-col gap-[7px]">
          <SkeletonBar width="58%" delay="0s" />
          <SkeletonBar width="38%" delay=".08s" />
        </div>
        <div className="flex min-h-[62px] flex-col gap-[7px] pt-1">
          <SkeletonBar width="94%" delay=".16s" />
          <SkeletonBar width="82%" delay=".24s" />
        </div>
        <div className="mt-auto flex items-center gap-2 border-t border-white/[0.06] pt-[14px]">
          <SkeletonBar width="52%" delay=".32s" />
        </div>
      </div>
    </div>
  )
}

/**
 * A full grid of placeholders.
 *
 * `role="status"` with a label, because a sighted reader sees the shimmer and a
 * screen-reader user would otherwise be told nothing at all while the catalogue
 * loads.
 */
export default function CatalogueToolSkeleton({ count }: { count: number }) {
  return (
    <div className={GRID_CLASS} role="status" aria-label="Loading tools">
      {Array.from({ length: count }, (_unused, index) => (
        <CatalogueToolCardSkeleton key={index} />
      ))}
    </div>
  )
}
