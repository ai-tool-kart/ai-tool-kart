import type { ToolCategoryName } from '@/types/tool'

/*
 * The launch category filter.
 *
 * Source: AI Tool Kart Site.dc.html, the chip row under the New Launches hero —
 * a scrolling rail of 38px pills, each carrying a label and the number of
 * launches in it, with the active chip in the design's violet fill.
 *
 * ── How this differs from Browse's chip row, and why ─────────────────────────
 *
 * components/catalogue/CategoryChipRow.tsx is MULTI-select with no counts, and
 * both of those are right for Browse: the API's `cat` parameter OR-s an array,
 * and honest per-category counts there would need one aggregate query per
 * category on every filter change.
 *
 * Neither constraint applies here. This page holds the whole chronological
 * catalogue in memory already, so a count per category is a `filter().length`
 * over an array the page has — free, and always exactly right. And the handoff
 * draws these as radio-like: "All" plus one category. Reusing the Browse row
 * would mean either dropping the counts the design specifies or bolting a
 * second mode onto a component whose whole doc explains why it has neither.
 *
 * So this is a separate row for a genuinely different control, and it shares
 * the chip geometry rather than the behaviour.
 */

export interface LaunchChip {
  /** `undefined` is the "All" chip — the absence of a category. */
  category?: ToolCategoryName
  label: string
  count: number
}

interface LaunchChipRowProps {
  chips: LaunchChip[]
  selected?: ToolCategoryName
  onSelect: (category?: ToolCategoryName) => void
}

const CHIP =
  'inline-flex h-[38px] flex-none cursor-pointer items-center gap-2 rounded-pill border px-[15px] text-[13.5px] font-medium tracking-[-0.006em] whitespace-nowrap transition-[color,border-color,background,box-shadow] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const ACTIVE =
  'border-[rgba(178,150,255,0.5)] bg-[linear-gradient(180deg,rgba(124,88,244,0.28)_0%,rgba(124,88,244,0.09)_100%)] text-[#F4EEFF] shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_16px_32px_-22px_rgba(124,88,244,0.9)]'

const IDLE =
  'border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_100%)] text-muted-soft shadow-[inset_0_1px_0_rgba(224,212,255,0.14)] hover:border-[rgba(178,150,255,0.42)] hover:text-[#F1EBFF]'

export default function LaunchChipRow({ chips, selected, onSelect }: LaunchChipRowProps) {
  if (chips.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Filter launches by category"
      className="relative mt-[26px] flex gap-[9px] overflow-x-auto px-[2px] pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {chips.map((chip) => {
        const active = chip.category === selected
        return (
          <button
            key={chip.category ?? 'all'}
            type="button"
            onClick={() => onSelect(chip.category)}
            aria-pressed={active}
            className={`${CHIP} ${active ? ACTIVE : IDLE}`}
          >
            {chip.label}
            <span className="text-[11.5px] text-muted-dim">{chip.count}</span>
          </button>
        )
      })}
    </div>
  )
}
