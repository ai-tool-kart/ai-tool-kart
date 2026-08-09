import { ALL_CATEGORIES, ANY_PRICE } from '@/data/filters'
import type { SortOption, Tool, ToolFilters } from '@/types/tool'

/*
 * Pure filtering/sorting over a Tool list, ported from the handoff's
 * `filtered()` method.
 *
 * These take Tool[] as input rather than importing the mock array, so swapping
 * in backend data later touches only the call sites.
 */

/** Matches the design's search: name, category, tagline and tags. */
function matchesQuery(tool: Tool, query: string): boolean {
  if (!query) return true
  const haystack = `${tool.name} ${tool.cat} ${tool.tagline} ${tool.tags.join(' ')}`
  return haystack.toLowerCase().includes(query)
}

export function filterTools(tools: Tool[], filters: ToolFilters): Tool[] {
  const query = filters.q.trim().toLowerCase()

  return tools.filter((tool) => {
    if (filters.cat !== ALL_CATEGORIES && tool.cat !== filters.cat) return false
    if (filters.price !== ANY_PRICE && tool.model !== filters.price) return false
    if (tool.rating < filters.minRating) return false
    return matchesQuery(tool, query)
  })
}

export function sortTools(tools: Tool[], sort: SortOption): Tool[] {
  return tools.slice().sort((a, b) => {
    switch (sort) {
      case 'Highest rated':
        return b.rating - a.rating
      case 'Most reviewed':
        return b.reviews - a.reviews
      case 'A–Z':
        return a.name.localeCompare(b.name)
      default:
        return b.pop - a.pop
    }
  })
}

/** Filter then sort, matching the order the design applies them. */
export function filterAndSortTools(tools: Tool[], filters: ToolFilters): Tool[] {
  return sortTools(filterTools(tools, filters), filters.sort)
}

export function findToolByName(tools: Tool[], name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name)
}
