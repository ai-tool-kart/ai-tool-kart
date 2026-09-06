import type { ToolCategoryName } from '@/types/tool'

/*
 * The category filter chips.
 *
 * Source: AI Tool Kart Site.dc.html, the scrolling chip row under the browse
 * controls. Horizontally scrollable with the scrollbar hidden, chips never wrap,
 * and the active chip carries the design's violet fill and lift shadow.
 *
 * ── Two changes from the design, both forced by real data ────────────────────
 *
 * MULTI-SELECT. The design's chips are radio-like: one category at a time,
 * with an "All categories" chip to clear. The API's `cat` parameter is an array
 * and OR-s its values, so the catalogue can genuinely answer "Code or Video".
 * Throwing that away to match a prototype's single-select would be losing a real
 * capability for a visual detail. "All" is therefore not a chip but the absence
 * of any selection, and clicking an active chip clears it.
 *
 * NO PER-CHIP COUNTS. The design shows a result count beside every category.
 * Producing those honestly needs one aggregate query per category — ten extra
 * requests on every filter change — or a counts endpoint the server does not
 * have, and this milestone is explicitly not the one that redesigns the API. The
 * real total for the current filters is shown above the grid instead, where it
 * is one number that is always correct rather than ten that go stale.
 */

interface CategoryChipRowProps {
  /** From GET /api/taxonomy. Empty renders nothing rather than a guess. */
  categories: ToolCategoryName[]
  selected: ToolCategoryName[]
  onToggle: (category: ToolCategoryName) => void
  /** Clears every category. Backs the "All categories" chip. */
  onClear: () => void
}

const CHIP =
  'inline-flex h-[38px] flex-none cursor-pointer items-center gap-2 rounded-pill border px-[15px] text-[13.5px] font-medium tracking-[-0.006em] whitespace-nowrap transition-[color,border-color,background,box-shadow] duration-300'

const ACTIVE =
  'border-[rgba(178,150,255,0.5)] bg-[linear-gradient(180deg,rgba(124,88,244,0.28)_0%,rgba(124,88,244,0.09)_100%)] text-[#F4EEFF] shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_16px_32px_-22px_rgba(124,88,244,0.9)]'

const IDLE =
  'border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_100%)] text-muted-soft shadow-[inset_0_1px_0_rgba(224,212,255,0.14)] hover:border-[rgba(178,150,255,0.32)] hover:text-[#E9E2FF]'

export default function CategoryChipRow({
  categories,
  selected,
  onToggle,
  onClear,
}: CategoryChipRowProps) {
  if (categories.length === 0) return null

  const noneSelected = selected.length === 0

  return (
    <div
      role="group"
      aria-label="Filter by category"
      className="relative mt-4 flex gap-[9px] overflow-x-auto px-[2px] pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        onClick={onClear}
        aria-pressed={noneSelected}
        className={`${CHIP} ${noneSelected ? ACTIVE : IDLE}`}
      >
        All categories
      </button>
      {categories.map((category) => {
        const active = selected.includes(category)
        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            aria-pressed={active}
            className={`${CHIP} ${active ? ACTIVE : IDLE}`}
          >
            {category}
          </button>
        )
      })}
    </div>
  )
}
