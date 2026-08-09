import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { SORT_OPTIONS } from '@/data/filters'
import type { SortOption } from '@/types/tool'

/*
 * Browse toolbar: free-text search, sort select and reset.
 * Source: AI Tool Kart Site.dc.html, the row above the Browse grid.
 */

interface BrowseToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  sort: SortOption
  onSortChange: (value: SortOption) => void
  onReset: () => void
}

export default function BrowseToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  onReset,
}: BrowseToolbarProps) {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-3">
      <div className="flex flex-[1_1_340px] items-center gap-[10px] rounded-pill border border-white/[0.09] bg-white/[0.035] py-1 pr-1 pl-4 transition-[border-color,box-shadow] duration-[250ms] hover:border-accent-line hover:shadow-[0_12px_26px_-20px_rgba(116,80,244,0.6)]">
        <span aria-hidden="true" className="text-[16px] text-subtle-dim">
          ⌕
        </span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search tools"
          placeholder="Search by name, task or tag"
          className="min-w-0 flex-auto border-0 bg-transparent px-1 py-3 text-[15px] text-ink outline-none"
        />
      </div>

      <Select
        value={sort}
        onChange={(value) => onSortChange(value as SortOption)}
        options={SORT_OPTIONS}
        ariaLabel="Sort results"
      />

      <Button variant="subtle" onClick={onReset}>
        Reset
      </Button>
    </div>
  )
}
