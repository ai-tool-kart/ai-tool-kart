import { CatalogueToolCardSkeleton } from '@/components/catalogue/CatalogueToolSkeleton'
import { LAUNCH_GRID_CLASS } from '@/components/launches/LaunchGroupHeading'

/*
 * New Launches while the catalogue is being read.
 *
 * The whole page depends on one request, so the placeholder holds the whole
 * page's geometry — the hero's two tracks and 250px artwork panel, the chip
 * rail, a group heading, and a row of cards — and nothing jumps when the tools
 * arrive.
 *
 * The card placeholder is the catalogue's own `CatalogueToolCardSkeleton`,
 * because the cards that land are catalogue cards. A second skeleton drawn to
 * look like the first is a second thing to keep in sync.
 */

const SHEEN = {
  background: 'linear-gradient(90deg,transparent,rgba(196,168,255,0.12),transparent)',
  animation: 'akSheen 1.9s ease-in-out infinite',
} as const

/** How many card placeholders to draw. A screenful at the widest layout. */
const CARD_COUNT = 4

export default function NewLaunchesSkeleton() {
  return (
    <div role="status" aria-label="Loading new launches">
      <div className="mt-[34px] grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] overflow-hidden rounded-panel-lg border border-white/[0.06] bg-[linear-gradient(140deg,rgba(124,88,244,0.07)_0%,rgba(255,255,255,0.025)_40%,rgba(255,255,255,0.01)_100%)]">
        <div className="relative min-h-[250px] overflow-hidden bg-[linear-gradient(158deg,rgba(167,139,250,0.12)_0%,rgba(18,14,32,0.72)_62%,rgba(11,8,20,0.92)_100%)]">
          <span className="absolute inset-0" style={SHEEN} />
        </div>
        <div className="flex flex-col justify-center gap-[15px] px-[clamp(22px,3vw,34px)] py-9">
          <span className="h-[23px] w-[190px] rounded-pill bg-white/[0.05]" />
          <span className="h-[30px] w-[62%] rounded-[6px] bg-white/[0.05]" />
          <span className="h-[15px] w-full rounded-[5px] bg-white/[0.045]" />
          <span className="h-[15px] w-3/5 rounded-[5px] bg-white/[0.045]" />
          <span className="h-[46px] w-[150px] rounded-pill bg-white/[0.05]" />
        </div>
      </div>

      {/* The chip rail: one "All" plus a few categories, at chip height. */}
      <div className="mt-[26px] flex gap-[9px] px-[2px] pt-1 pb-2">
        {[74, 96, 88, 104, 92].map((width, index) => (
          <span
            key={index}
            style={{ width }}
            className="h-[38px] flex-none rounded-pill border border-white/[0.06] bg-white/[0.03]"
          />
        ))}
      </div>

      <div className="mt-[38px]">
        <div className="flex items-center gap-4">
          <span className="h-[13px] w-[120px] rounded-[5px] bg-white/[0.06]" />
          <span aria-hidden="true" className="h-px flex-auto bg-white/[0.05]" />
          <span className="h-[13px] w-[52px] rounded-[5px] bg-white/[0.05]" />
        </div>
        <div className={`mt-5 ${LAUNCH_GRID_CLASS}`}>
          {Array.from({ length: CARD_COUNT }, (_unused, index) => (
            <CatalogueToolCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
