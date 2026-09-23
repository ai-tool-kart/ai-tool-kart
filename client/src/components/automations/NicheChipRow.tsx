import { NICHES, type NicheName } from '@/types/automation'

/*
 * The niche filter: "All niches" plus all 25, single-select.
 *
 * Styled with the exact chip classes of components/catalogue/CategoryChipRow
 * (scrolling row, hidden scrollbar, violet active fill), but single-select:
 * the automations API takes one niche, not a list, so picking a second one
 * replaces the first. Selecting the active niche again clears it.
 */

const CHIP =
  'inline-flex h-[38px] flex-none cursor-pointer items-center gap-2 rounded-pill border px-[15px] text-[13.5px] font-medium tracking-[-0.006em] whitespace-nowrap transition-[color,border-color,background,box-shadow] duration-300'

const ACTIVE =
  'border-[rgba(178,150,255,0.5)] bg-[linear-gradient(180deg,rgba(124,88,244,0.28)_0%,rgba(124,88,244,0.09)_100%)] text-[#F4EEFF] shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_16px_32px_-22px_rgba(124,88,244,0.9)]'

const IDLE =
  'border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_100%)] text-muted-soft shadow-[inset_0_1px_0_rgba(224,212,255,0.14)] hover:border-[rgba(178,150,255,0.32)] hover:text-[#E9E2FF]'

interface NicheChipRowProps {
  selected?: NicheName
  /** Undefined means "All niches". */
  onSelect: (niche?: NicheName) => void
}

export default function NicheChipRow({ selected, onSelect }: NicheChipRowProps) {
  return (
    <div
      role="group"
      aria-label="Filter by niche"
      className="relative mt-4 flex gap-[9px] overflow-x-auto px-[2px] pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        aria-pressed={selected === undefined}
        className={`${CHIP} ${selected === undefined ? ACTIVE : IDLE}`}
      >
        All niches
      </button>
      {NICHES.map((niche) => {
        const active = selected === niche
        return (
          <button
            key={niche}
            type="button"
            onClick={() => onSelect(active ? undefined : niche)}
            aria-pressed={active}
            className={`${CHIP} ${active ? ACTIVE : IDLE}`}
          >
            {niche}
          </button>
        )
      })}
    </div>
  )
}
