import { useNavigate, useSearchParams } from 'react-router-dom'
import BrowseToolbar from '@/components/browse/BrowseToolbar'
import EmptyState from '@/components/browse/EmptyState'
import FilterSidebar from '@/components/browse/FilterSidebar'
import Section from '@/components/layout/Section'
import ToolGrid from '@/components/tools/ToolGrid'
import SectionHeading from '@/components/ui/SectionHeading'
import { ALL_CATEGORIES, ANY_PRICE, SORT_OPTIONS } from '@/data/filters'
import { TOOLS } from '@/data/tools'
import type { SortOption, Tool, ToolFilters } from '@/types/tool'
import { filterAndSortTools } from '@/utils/filterTools'

/*
 * Browse — the catalog view.
 *
 * Filter state lives in the URL rather than component state. The prototype kept
 * it in memory only because it had no URL at all; routing it makes results
 * shareable and correct under back/forward and reload. Nothing about the
 * rendering changes.
 *
 * Defaults mirror the design's initial state, and a param is written only when
 * it differs from its default, so a clean Browse visit stays at /browse.
 */

const DEFAULT_SORT: SortOption = 'Most popular'
const DEFAULT_MIN_RATING = 4

/* Reset matches the design's resetFilters(), which drops the rating floor to 0
   (not back to the initial 4) and leaves sort untouched. */
const RESET_MIN_RATING = 0

function isSortOption(value: string | null): value is SortOption {
  return value !== null && (SORT_OPTIONS as string[]).includes(value)
}

export default function BrowsePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawMinRating = Number(searchParams.get('minRating'))
  const rawSort = searchParams.get('sort')
  const filters: ToolFilters = {
    q: searchParams.get('q') ?? '',
    cat: searchParams.get('cat') ?? ALL_CATEGORIES,
    price: searchParams.get('price') ?? ANY_PRICE,
    minRating:
      searchParams.has('minRating') && Number.isFinite(rawMinRating)
        ? rawMinRating
        : DEFAULT_MIN_RATING,
    sort: isSortOption(rawSort) ? rawSort : DEFAULT_SORT,
  }

  /** Writes only non-default params. `replace` avoids a history entry per keystroke. */
  function update(patch: Partial<ToolFilters>, replace = false) {
    const next = { ...filters, ...patch }
    const params = new URLSearchParams()
    if (next.q.trim()) params.set('q', next.q)
    if (next.cat !== ALL_CATEGORIES) params.set('cat', next.cat)
    if (next.price !== ANY_PRICE) params.set('price', next.price)
    if (next.minRating !== DEFAULT_MIN_RATING) params.set('minRating', String(next.minRating))
    if (next.sort !== DEFAULT_SORT) params.set('sort', next.sort)
    setSearchParams(params, { replace })
  }

  function resetFilters() {
    update({
      q: '',
      cat: ALL_CATEGORIES,
      price: ANY_PRICE,
      minRating: RESET_MIN_RATING,
    })
  }

  const results = filterAndSortTools(TOOLS, filters)

  function compareTool(tool: Tool) {
    navigate(`/compare?tool=${encodeURIComponent(tool.id)}`)
  }

  return (
    <Section spacing="sub">
      <SectionHeading eyebrow="Catalog" title="Browse tools" as="h1" />

      <BrowseToolbar
        query={filters.q}
        onQueryChange={(q) => update({ q }, true)}
        sort={filters.sort}
        onSortChange={(sort) => update({ sort })}
        onReset={resetFilters}
      />

      <div className="mt-[34px] grid grid-cols-[236px_1fr] items-start gap-[34px]">
        <FilterSidebar
          category={filters.cat}
          onCategoryChange={(cat) => update({ cat })}
          price={filters.price}
          onPriceChange={(price) => update({ price })}
          minRating={filters.minRating}
          onMinRatingChange={(minRating) => update({ minRating }, true)}
        />

        <div>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div className="text-[14px] text-muted">{results.length} tools match</div>
            <div className="text-[13px] text-subtle-dim">Last catalog refresh: 2 hours ago</div>
          </div>

          {results.length > 0 ? (
            <ToolGrid tools={results} variant="browse" onCompare={compareTool} />
          ) : (
            <EmptyState onReset={resetFilters} />
          )}
        </div>
      </div>
    </Section>
  )
}
