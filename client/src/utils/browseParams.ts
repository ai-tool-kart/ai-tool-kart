import type { Taxonomy } from '@/types/taxonomy'
import type { PricingTierName, SortOption, ToolCategoryName, ToolFilters } from '@/types/tool'

/*
 * The Browse URL ⇄ filter-state boundary.
 *
 * Filter state lives in the URL and nowhere else. That is what makes a filtered
 * result shareable, survive a reload, and behave under back/forward — none of
 * which the design prototype could do, because it kept filters in component
 * state. Everything here is a pure function so that behaviour is testable
 * without mounting a page.
 *
 * ── Why parsing validates against the taxonomy ───────────────────────────────
 *
 * The API rejects an unknown value rather than ignoring it: `?cat=Bogus` is a
 * 400 for the whole request, not a request with one filter dropped. A URL is
 * user-editable and outlives a deploy, so anything from it must be checked
 * before it becomes a query. A stale `?cat=Chatbots` from an old bookmark is
 * dropped and the rest of the filters still work — far better than an error
 * page for a category that was renamed six months ago.
 *
 * The valid values come from GET /api/taxonomy, never from a list in this file:
 * a second copy of the vocabulary is exactly how the frontend drifts from the
 * catalogue it is filtering.
 */

/** No sort param in the URL means the API's own default. */
export const DEFAULT_SORT: SortOption = 'relevance'

export const EMPTY_FILTERS: ToolFilters = { q: '', cat: [], price: [], sort: DEFAULT_SORT }

/**
 * Reads filter state out of a query string.
 *
 * `taxonomy` is undefined until the vocabulary request lands. While it is,
 * category and tier values are dropped rather than trusted — Browse holds its
 * first catalogue request until the taxonomy is in, so this never costs a
 * visible state, and it means an unvalidated value can never reach the API.
 */
export function parseBrowseParams(
  params: URLSearchParams,
  taxonomy: Taxonomy | undefined,
): ToolFilters {
  const categories = new Set<string>(taxonomy?.categories ?? [])
  const tiers = new Set<string>(taxonomy?.pricingTiers ?? [])
  const sorts = new Set<string>((taxonomy?.sorts ?? []).map((sort) => sort.value))

  const rawSort = params.get('sort')

  return {
    q: params.get('q') ?? '',
    cat: unique(params.getAll('cat')).filter((v): v is ToolCategoryName => categories.has(v)),
    price: unique(params.getAll('price')).filter((v): v is PricingTierName => tiers.has(v)),
    sort: rawSort && sorts.has(rawSort) ? (rawSort as SortOption) : DEFAULT_SORT,
  }
}

/**
 * Writes filter state back to a query string.
 *
 * A value equal to its default is omitted, so a clean Browse visit stays at
 * `/browse` rather than `/browse?q=&sort=relevance`. Multi-value axes are
 * repeated keys, matching both the API's schema and `parseBrowseParams`.
 */
export function toBrowseParams(filters: ToolFilters): URLSearchParams {
  const params = new URLSearchParams()
  const q = filters.q.trim()
  if (q) params.set('q', q)
  for (const cat of filters.cat) params.append('cat', cat)
  for (const price of filters.price) params.append('price', price)
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
  return params
}

/** True when nothing is filtering — drives the "Reset" control's enabled state. */
export function hasActiveFilters(filters: ToolFilters): boolean {
  return (
    filters.q.trim().length > 0 ||
    filters.cat.length > 0 ||
    filters.price.length > 0 ||
    filters.sort !== DEFAULT_SORT
  )
}

/** Adds or removes one value from a multi-select axis. */
export function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
