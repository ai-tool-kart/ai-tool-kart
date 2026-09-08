import { useEffect, useMemo, useState } from 'react'
import { useTaxonomy } from '@/hooks/useTaxonomy'
import { getTools } from '@/services/tools'
import type { PopularWay } from '@/types/popularWay'
import type { Tool, ToolCategoryName } from '@/types/tool'

/*
 * What the catalogue knows about each "popular way".
 *
 * The editorial file (data/popularWays.ts) says which outcomes belong on the
 * homepage and what to call them. This hook answers the two questions only the
 * catalogue can: how many tools actually serve that outcome, and what those
 * tools are about.
 *
 * ── Why a hook of its own rather than useTools ───────────────────────────────
 *
 * Both go through services/tools.ts — there is still exactly one fetch path to
 * the catalogue, which is the point. But `useTools` is Browse's shape: ONE
 * filter set, a page of results, a cursor, "load more", and results cleared on
 * failure so a stale list is never presented as an answer. This section needs
 * the opposite: SIX filter sets at once, no pagination, and a failure that must
 * be survivable, because a card whose count did not load is still a perfectly
 * good link. Bending `useTools` into both would make Browse's behaviour
 * conditional on which page mounted it.
 *
 * ── Why it waits for the taxonomy ────────────────────────────────────────────
 *
 * The API rejects an unknown `cat` with a 400 for the WHOLE request rather than
 * ignoring the parameter. Category names are typed here, but a type is checked
 * when this file is compiled and the server is deployed separately — so the
 * names are validated against GET /api/taxonomy first, exactly as a hand-edited
 * Browse URL is (utils/browseParams.ts). A renamed category then costs one card
 * its count instead of costing every card its request. The taxonomy is cached
 * module-level in services/taxonomy.ts, so this costs no extra request on a page
 * that already asked for it.
 *
 * ── Failure is quiet, on purpose ─────────────────────────────────────────────
 *
 * There is no `error` and no `retry` in the returned shape, and that is a
 * decision rather than an omission. Every field this hook supplies is
 * supporting detail on a card that reads correctly without it. A homepage
 * section that shouts "couldn't load" over six working links has made a
 * cosmetic failure into the reader's problem. Requests are settled
 * independently, so one category's failure costs one card its count.
 */

/**
 * How many tools are read per way to derive its topics.
 *
 * The COUNT is unaffected by this — `total` is the server's count across the
 * whole catalogue, not the page. This only bounds the sample the topics are
 * drawn from, and it is deliberately small: the request is ordered by `popular`,
 * so the sample is the way's most prominent tools, which is exactly whose
 * subject matter should name the shelf. Raising it would add payload and let
 * long-tail tools outvote them.
 */
const TOPIC_SAMPLE_SIZE = 8

/** Topics shown per card. The design's row fits three before it ellipsises. */
const TOPIC_COUNT = 3

export interface PopularWaySummary {
  /**
   * Tools matching the way's categories across the whole catalogue.
   *
   * Undefined until the request lands, and after one that failed. It is the
   * same number Browse will show for the same filter, because it is the same
   * question asked of the same endpoint.
   */
  toolCount?: number
  /**
   * Up to three subjects, taken from the tags the way's most prominent tools
   * actually carry. Empty when nothing has loaded, or when the sample carried
   * no tag that says more than the category name already does.
   */
  topics: string[]
}

export interface PopularWaysResource {
  /** Keyed by `PopularWay.id`. A missing entry means "nothing resolved". */
  summaries: Record<string, PopularWaySummary>
  /** True until every request has settled. Cards render throughout. */
  isLoading: boolean
}

/**
 * The subjects a set of tools is about, most common first.
 *
 * Deterministic by construction: the server returns a stable order for a stable
 * query, frequency is the first key and first appearance in that order is the
 * tie-break, so the same catalogue always produces the same three words.
 *
 * A tag identical to one of the way's own categories is dropped — "Video" under
 * a card already filtered to Video is a word spent saying nothing.
 */
function topicsFor(tools: Tool[], categories: ToolCategoryName[]): string[] {
  const excluded = new Set(categories.map((category) => category.toLowerCase()))
  const counts = new Map<string, { tag: string; count: number; first: number }>()

  tools.forEach((tool, position) => {
    for (const tag of tool.tags) {
      const key = tag.toLowerCase()
      if (excluded.has(key)) continue
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { tag, count: 1, first: position })
      }
    }
  })

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, TOPIC_COUNT)
    .map((entry) => entry.tag)
}

export function usePopularWays(ways: PopularWay[]): PopularWaysResource {
  const { data: taxonomy, isLoading: taxonomyLoading, failed: taxonomyFailed } = useTaxonomy()
  const [summaries, setSummaries] = useState<Record<string, PopularWaySummary>>({})
  const [isLoading, setIsLoading] = useState(true)

  /*
   * The ways are a module constant today, but a caller could hand over a fresh
   * array on every render. Its identity for effect purposes is what it asks the
   * API for — the ids and the category sets — so two arrays meaning the same
   * six queries fire one round of requests, not one per render.
   */
  const key = useMemo(
    () => ways.map((way) => `${way.id}:${way.categories.join(',')}`).join('|'),
    [ways],
  )

  useEffect(() => {
    // A taxonomy that failed is terminal for this section: without the
    // vocabulary nothing can be validated, so no request is built at all and
    // every card renders on its editorial content alone.
    if (taxonomyFailed) {
      setIsLoading(false)
      return
    }
    if (!taxonomy) return

    let live = true
    const known = new Set<string>(taxonomy.categories)
    setIsLoading(true)

    const requests = ways.map(async (way) => {
      const categories = way.categories.filter((category) => known.has(category))
      if (categories.length === 0) return undefined

      const page = await getTools({
        cat: categories,
        sort: 'popular',
        limit: TOPIC_SAMPLE_SIZE,
      })
      return {
        id: way.id,
        summary: { toolCount: page.total, topics: topicsFor(page.items, categories) },
      }
    })

    void Promise.allSettled(requests).then((results) => {
      if (!live) return
      const next: Record<string, PopularWaySummary> = {}
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue
        next[result.value.id] = result.value.summary
      }
      setSummaries(next)
      setIsLoading(false)
    })

    return () => {
      live = false
    }
    // `ways` is intentionally absent: `key` is its identity. See above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, taxonomy, taxonomyFailed])

  return { summaries, isLoading: isLoading || taxonomyLoading }
}
