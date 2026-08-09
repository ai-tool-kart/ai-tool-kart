import Chip from '@/components/ui/Chip'
import RangeSlider from '@/components/ui/RangeSlider'
import { CATEGORIES } from '@/data/categories'
import { ALL_CATEGORIES, PRICE_FILTERS } from '@/data/filters'
import { TOOLS } from '@/data/tools'

/*
 * Browse filter sidebar: category list, pricing-model chips, minimum rating.
 * Source: AI Tool Kart Site.dc.html, the <aside> beside the results grid.
 *
 * Two faithful-to-source behaviours worth knowing about:
 *
 *  1. The category list is built from CATEGORIES (8 entries) plus an
 *     "All categories" row whose count is the real tool total, while the other
 *     rows use the design's editorial counts (284, 361, …). Because only those
 *     8 have rows, tools in "Research" (Atlas Research) and "Marketing"
 *     (Signal Brief) are reachable only via "All categories" or search. That
 *     gap exists in the handoff and is left visible rather than papered over.
 *
 *  2. The pricing-model chips render no selected state — the design computes an
 *     `active` flag for them but never uses it in the markup, unlike the
 *     category rows which do show an active bar. Reproduced as-is.
 */

const CATEGORY_ROWS = [
  { label: ALL_CATEGORIES, count: TOOLS.length },
  ...CATEGORIES.map((category) => ({ label: category.name, count: category.count })),
]

interface FilterSidebarProps {
  category: string
  onCategoryChange: (value: string) => void
  price: string
  onPriceChange: (value: string) => void
  minRating: number
  onMinRatingChange: (value: number) => void
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] tracking-[0.12em] uppercase text-subtle">{label}</div>
      {children}
    </div>
  )
}

export default function FilterSidebar({
  category,
  onCategoryChange,
  price,
  onPriceChange,
  minRating,
  onMinRatingChange,
}: FilterSidebarProps) {
  return (
    <aside className="sticky top-[104px] flex flex-col gap-[26px] rounded-card-lg border border-hairline bg-white/[0.035] p-[22px] shadow-[0_1px_2px_rgba(0,0,0,0.40),0_18px_40px_-34px_rgba(0,0,0,0.90)]">
      <FilterGroup label="Category">
        <div className="mt-3 flex flex-col gap-[2px]">
          {CATEGORY_ROWS.map((row) => {
            const active = category === row.label
            return (
              <button
                key={row.label}
                type="button"
                onClick={() => onCategoryChange(row.label)}
                className={`relative flex cursor-pointer items-center justify-between gap-2 rounded-chip px-[10px] py-2 text-[14px] transition-[background-color,color] duration-200 ${
                  active ? 'text-ink' : 'text-muted-soft hover:bg-white/[0.07] hover:text-ink'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 h-4 w-[3px] rounded-[2px] bg-accent-soft"
                  />
                )}
                <span>{row.label}</span>
                <span className="text-[12.5px] text-subtle-dim">{row.count}</span>
              </button>
            )
          })}
        </div>
      </FilterGroup>

      <FilterGroup label="Pricing model">
        <div className="mt-3 flex flex-wrap gap-[7px]">
          {PRICE_FILTERS.map((label) => (
            <Chip
              key={label}
              variant="filter"
              /* See note above: the design shows no selected state here. */
              active={false}
              onClick={() => onPriceChange(label)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Minimum rating">
        <div className="mt-[14px]">
          <RangeSlider value={minRating} onChange={onMinRatingChange} />
        </div>
      </FilterGroup>

      {/* Keeps the current pricing selection available to assistive tech even
          though the design shows no visual indicator. */}
      <span className="sr-only" aria-live="polite">
        Pricing model filter: {price}
      </span>
    </aside>
  )
}
