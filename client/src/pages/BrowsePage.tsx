import { useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrowseControls from '@/components/catalogue/BrowseControls'
import { BrowseEmptyState, BrowseErrorState } from '@/components/catalogue/BrowseStates'
import CatalogueToolGrid from '@/components/catalogue/CatalogueToolGrid'
import CatalogueToolSkeleton, {
  CatalogueToolCardSkeleton,
} from '@/components/catalogue/CatalogueToolSkeleton'
import CategoryChipRow from '@/components/catalogue/CategoryChipRow'
import RefineSidebar from '@/components/catalogue/RefineSidebar'
import { usePlanTools } from '@/hooks/usePlanTools'
import { useTaxonomy } from '@/hooks/useTaxonomy'
import { SEARCH_DEBOUNCE_MS, useTools } from '@/hooks/useTools'
import { BROWSE_PAGE_SIZE } from '@/services/tools'
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  parseBrowseParams,
  toBrowseParams,
  toggle,
} from '@/utils/browseParams'
import type { PricingTierName, Tool, ToolCategoryName, ToolFilters } from '@/types/tool'

/*
 * Browse — the catalogue, from GET /api/tools.
 *
 * The final design's layout, over the React implementation's URL-driven state.
 * Neither was dropped for the other:
 *
 *   FROM THE DESIGN  the heading block and live catalogue count, the pill
 *                    control row, the scrolling category chips, the sticky
 *                    Refine rail, the auto-fit results grid and its cards.
 *   FROM THE APP     every filter lives in the query string, so a result set is
 *                    shareable, survives a reload, and moves correctly under
 *                    Back and Forward. The prototype held filters in component
 *                    state and had none of that.
 *
 * ── Filtering is the server's, all of it ─────────────────────────────────────
 *
 * q, category, pricing tier and sort all travel to GET /api/tools, which applies
 * them across the whole catalogue and returns an honest `total`. Nothing is
 * filtered in the browser. That is not only less code: the endpoint paginates at
 * 24, so a client-side filter would be filtering one page and reporting the
 * result as the whole catalogue.
 *
 * ── Why the first request waits for the taxonomy ─────────────────────────────
 *
 * A URL is user-editable and outlives a deploy, and the API rejects an unknown
 * filter value with a 400 for the WHOLE request rather than ignoring it. So the
 * category and tier values out of the URL are checked against GET /api/taxonomy
 * before they can become a query, and the catalogue request is held until that
 * vocabulary is in. It costs one short request on a cold load, covered by the
 * skeleton, and it means a stale bookmark loses one filter instead of erroring.
 */

export default function BrowsePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const taxonomy = useTaxonomy()

  /*
   * `?tools=slug1,slug2` is a different mode of this page entirely: exactly
   * these tools, not a filtered view of the catalogue. The assistant's plan
   * panel links here — "See these tools" — so a reader lands on the same
   * catalogue surface with exactly what the plan named, rather than a text
   * search standing in for it. It is mutually exclusive with the ordinary
   * filters below, and short-circuits their request entirely.
   */
  const planSlugs = useMemo(() => {
    const raw = searchParams.get('tools')
    if (!raw) return []
    return [...new Set(raw.split(',').map((slug) => slug.trim()).filter(Boolean))]
  }, [searchParams])
  const isPlanView = planSlugs.length > 0
  const planTools = usePlanTools(planSlugs)

  /*
   * The URL is the state. Re-derived on every render rather than mirrored into
   * useState, so Back/Forward and a pasted link all take the identical path
   * through the component — there is no second copy to fall out of step.
   */
  const filters: ToolFilters = useMemo(
    () => parseBrowseParams(searchParams, taxonomy.data),
    [searchParams, taxonomy.data],
  )

  /*
   * Once the taxonomy has failed there is no vocabulary to validate against, so
   * holding the catalogue request forever would leave the page on a skeleton.
   * Browse proceeds with the query and sort only — both are free-form as far as
   * the API is concerned — and the chip row and tier rail simply do not render.
   */
  const ready = !taxonomy.isLoading

  /*
   * Typing debounces; clicking does not. A chip or a sort should feel immediate,
   * while a keystroke should not become a request. The two are told apart by
   * which control last wrote to the URL.
   */
  const typingRef = useRef(false)

  const results = useTools(filters, {
    enabled: ready && !isPlanView,
    debounceMs: typingRef.current ? SEARCH_DEBOUNCE_MS : 0,
    limit: BROWSE_PAGE_SIZE,
  })

  /**
   * Writes the next filter state to the URL.
   *
   * A ten-character query must leave ONE history entry, not ten — but it must
   * not swallow the entry before it either. So the FIRST keystroke pushes and
   * the rest replace: Back from a typed query returns to the filter state the
   * reader was in when they started typing, and one more Back undoes that.
   * Replacing from the first keystroke, which is the obvious implementation,
   * quietly eats the category click that preceded the search.
   */
  const update = useCallback(
    (patch: Partial<ToolFilters>, { fromTyping = false } = {}) => {
      const continuingToType = fromTyping && typingRef.current
      typingRef.current = fromTyping
      setSearchParams(toBrowseParams({ ...filters, ...patch }), { replace: continuingToType })
    },
    [filters, setSearchParams],
  )

  const reset = useCallback(() => {
    typingRef.current = false
    setSearchParams(toBrowseParams(EMPTY_FILTERS))
  }, [setSearchParams])

  /*
   * One outage fails both endpoints, so one button revives both. Retrying the
   * taxonomy is harmless when it already succeeded — it is a cached constant.
   */
  const retryAll = useCallback(() => {
    if (taxonomy.failed) taxonomy.retry()
    results.retry()
  }, [taxonomy, results])

  const compare = useCallback(
    (tool: Tool) => navigate(`/compare?tool=${encodeURIComponent(tool.slug)}`),
    [navigate],
  )

  const showSkeleton = !ready || results.isLoading
  const canReset = hasActiveFilters(filters)
  /*
   * A failed request knows nothing about the catalogue's size, so the count
   * must not render as "0 tools" — that is a claim about the catalogue, and a
   * false one. Both counters fall back to an em dash and let the error panel
   * do the explaining.
   */
  const countKnown = !showSkeleton && !results.error

  return (
    <section className="relative mx-auto max-w-site px-8 pt-16">
      {/* The two drifting mesh glows the design puts behind this screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[4%] left-[-12%] h-[520px] w-[58%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(124,88,244,0.2)_0%,rgba(96,52,210,0.06)_48%,transparent_76%)] blur-[46px] [animation:akMeshA_72s_cubic-bezier(.45,0,.55,1)_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[26%] right-[-16%] h-[600px] w-[52%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(154,110,255,0.16)_0%,rgba(202,168,255,0.05)_46%,transparent_74%)] blur-[52px] [animation:akMeshB_88s_cubic-bezier(.45,0,.55,1)_infinite]"
      />

      <header className="relative flex flex-wrap items-end justify-between gap-7">
        <div>
          <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">Catalog</p>
          <h1 className="mt-3 text-[clamp(34px,5vw,52px)] font-bold tracking-[-0.04em] text-ink">
            {isPlanView ? 'Tools from your plan' : 'Browse AI tools'}
          </h1>
          <p className="mt-[14px] max-w-[56ch] text-[15.5px] leading-[1.65] tracking-[-0.006em] text-pretty text-muted-dim">
            {isPlanView ? (
              <>
                Exactly the tools your plan named.{' '}
                <button
                  type="button"
                  onClick={() => navigate('/browse')}
                  className="cursor-pointer font-semibold text-accent underline-offset-2 hover:underline"
                >
                  Browse the whole catalogue
                </button>{' '}
                instead.
              </>
            ) : (
              'Design, development, video, research, marketing and more — every listing tested on the ' +
              'same brief.'
            )}
          </p>
        </div>
        {/*
         * The design hardcodes "2,412 tools · refreshed 2h ago". The count is
         * now the API's real `total` for the current filters. The refresh time
         * is dropped: the catalogue exposes no such timestamp, and inventing one
         * would be the one kind of number a catalogue must never fake.
         */}
        {!isPlanView && (
          <div className="inline-flex items-center gap-[9px] rounded-pill border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.022)_100%)] px-4 py-[10px] shadow-[inset_0_1px_0_rgba(224,212,255,0.18)]">
            <span
              aria-hidden="true"
              className="h-[6px] w-[6px] rounded-full bg-[#9BE7C4] shadow-[0_0_9px_2px_rgba(120,220,170,0.6)]"
            />
            <span className="text-[13.5px] font-semibold text-[#E4DEF5]">
              {countKnown ? `${results.total.toLocaleString()} ${results.total === 1 ? 'tool' : 'tools'}` : '— tools'}
            </span>
            {countKnown && canReset && <span className="text-[13px] text-[#615C7A]">· filtered</span>}
          </div>
        )}
      </header>

      {/* The cards' names are h3s; this keeps the outline h1 → h2 → h3 in both
          modes (the same fix as the automations list). */}
      {isPlanView && <h2 className="sr-only">Results</h2>}
      {isPlanView ? (
        planTools.isLoading ? (
          <div className="mt-[34px]">
            <CatalogueToolSkeleton count={planSlugs.length || 3} />
          </div>
        ) : planTools.error ? (
          <div className="mt-[34px]">
            <BrowseErrorState message={planTools.error} onRetry={planTools.retry} />
          </div>
        ) : planTools.tools.length === 0 ? (
          <div className="mt-[34px]">
            <BrowseEmptyState onReset={() => navigate('/browse')} />
          </div>
        ) : (
          <div className="mt-[34px]">
            <CatalogueToolGrid
              tools={planTools.tools}
              onCompare={(tool) => navigate(`/compare?tool=${encodeURIComponent(tool.slug)}`)}
            />
          </div>
        )
      ) : (
        <>
          <BrowseControls
            query={filters.q}
            onQueryChange={(q) => update({ q }, { fromTyping: true })}
            sort={filters.sort}
            onSortChange={(sort) => update({ sort })}
            sorts={taxonomy.data?.sorts ?? []}
            onReset={reset}
            canReset={canReset}
          />

          <CategoryChipRow
            categories={taxonomy.data?.categories ?? []}
            selected={filters.cat}
            onToggle={(cat: ToolCategoryName) => update({ cat: toggle(filters.cat, cat) })}
            onClear={() => update({ cat: [] })}
          />

          <div className="relative mt-[22px] grid items-start gap-[34px] lg:grid-cols-[236px_1fr]">
            {/*
             * A DIRECT grid item, deliberately. `position: sticky` on a grid item
             * resolves against its grid AREA, which is as tall as the results
             * column beside it; nested inside a wrapper div it would resolve
             * against that div, which under `items-start` is exactly its own
             * height — no travel, and the rail scrolls away. The responsive
             * hiding therefore rides on the aside itself, not on a wrapper.
             *
             * Below the design's two-column width the rail would squeeze the grid
             * to a single card, so it drops out and the chip row carries the
             * filtering.
             */}
            <RefineSidebar
              className="hidden lg:flex"
              tiers={taxonomy.data?.pricingTiers ?? []}
              selected={filters.price}
              onToggle={(tier: PricingTierName) => update({ price: toggle(filters.price, tier) })}
              onClearTiers={() => update({ price: [] })}
              minRating={filters.minRating}
              onMinRatingChange={(minRating) => update({ minRating }, { fromTyping: true })}
            />

            <div>
              <h2 className="sr-only">Results</h2>
              <div className="mb-[18px] flex items-baseline justify-between gap-4">
                <p className="text-[14px] text-muted-dim" aria-live="polite">
                  {showSkeleton && 'Loading tools…'}
                  {results.error && !showSkeleton && 'Catalogue unavailable'}
                  {countKnown && (
                    <>
                      <span className="font-semibold text-[#E4DEF5]">
                        {results.total.toLocaleString()}
                      </span>{' '}
                      {results.total === 1 ? 'tool matches' : 'tools match'}
                    </>
                  )}
                </p>
                <p className="text-[13px] text-[#615C7A]">
                  {taxonomy.data?.sorts.find((s) => s.value === filters.sort)?.label ?? ''}
                </p>
              </div>

              {showSkeleton ? (
                <CatalogueToolSkeleton count={6} />
              ) : results.error ? (
                <BrowseErrorState message={results.error} onRetry={retryAll} />
              ) : results.tools.length === 0 ? (
                <BrowseEmptyState onReset={reset} />
              ) : (
                <>
                  <CatalogueToolGrid tools={results.tools} onCompare={compare}>
                    {results.isLoadingMore &&
                      Array.from({ length: 3 }, (_unused, index) => (
                        <CatalogueToolCardSkeleton key={`more-${index}`} />
                      ))}
                  </CatalogueToolGrid>

                  {results.hasMore && (
                    <div className="mt-8 flex justify-center">
                      <button
                        type="button"
                        onClick={results.loadMore}
                        disabled={results.isLoadingMore}
                        className="inline-flex h-[46px] cursor-pointer items-center gap-2 rounded-pill border border-white/[0.1] bg-[linear-gradient(180deg,rgba(255,255,255,0.075)_0%,rgba(255,255,255,0.025)_100%)] px-6 text-[14px] font-semibold text-muted-soft shadow-[inset_0_1px_0_rgba(224,212,255,0.18)] transition-[color,border-color,transform] duration-300 hover:-translate-y-px hover:border-[rgba(178,150,255,0.38)] hover:text-[#F0EBFC] disabled:cursor-default disabled:opacity-50"
                      >
                        {results.isLoadingMore
                          ? 'Loading…'
                          : `Show more (${(results.total - results.tools.length).toLocaleString()} left)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
