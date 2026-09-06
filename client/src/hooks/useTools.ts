import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '@/services/http'
import { BROWSE_PAGE_SIZE, getTools, getToolBySlug, toolQueryString } from '@/services/tools'
import type { Tool, ToolFilters } from '@/types/tool'

/*
 * Catalogue data hooks.
 *
 * `useTools` is the list; `useTool` is one record by slug. Both go through
 * services/tools.ts and neither knows what a component looks like, so the Browse
 * page, and in Milestone 4 the Featured / Recently-added / AI-for-your-work
 * sections, can all read the catalogue the same way.
 *
 * ── Every filter is the server's ─────────────────────────────────────────────
 *
 * The hook re-requests when the filters change rather than filtering what it
 * already has. That is not laziness about caching: the API paginates, so a
 * client-side filter would be filtering the first 24 of 66 tools and reporting
 * the result as the whole catalogue. `total` likewise comes from the server and
 * counts every match, not the number currently rendered.
 */

/** How long a keystroke waits before it becomes a request. */
export const SEARCH_DEBOUNCE_MS = 300

export interface ToolsResource {
  tools: Tool[]
  /** Total matching the filters across the whole catalogue, not the page. */
  total: number
  /** True during the FIRST load of a filter set — the skeleton state. */
  isLoading: boolean
  /** True while "Load more" is fetching — the page keeps its results. */
  isLoadingMore: boolean
  /** A reader-facing message, or undefined when the request succeeded. */
  error: string | undefined
  /** True when another page exists. */
  hasMore: boolean
  loadMore: () => void
  retry: () => void
}

function messageFor(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong while loading the catalogue.'
}

export interface UseToolsOptions {
  /**
   * Hold requests until the caller is ready.
   *
   * Browse sets this false until the taxonomy has loaded, because filter values
   * out of the URL cannot be validated before then and an unvalidated `cat` is
   * a 400 for the whole request rather than one ignored parameter.
   */
  enabled?: boolean
  /** Debounce before the request fires. Browse passes this for typing. */
  debounceMs?: number
  limit?: number
}

export function useTools(
  filters: ToolFilters,
  { enabled = true, debounceMs = 0, limit = BROWSE_PAGE_SIZE }: UseToolsOptions = {},
): ToolsResource {
  const [tools, setTools] = useState<Tool[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  /*
   * The filter object is rebuilt on every render (it is derived from the URL),
   * so it can never be an effect dependency — it would refire forever. Its
   * serialised form is the real identity: two renders that mean the same query
   * produce the same string and no request.
   */
  const key = toolQueryString({ ...filters, limit })

  const controllerRef = useRef<AbortController | undefined>(undefined)
  const liveRef = useRef(true)

  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  /* First page: re-runs whenever the query changes or a retry is requested. */
  useEffect(() => {
    if (!enabled) return

    setIsLoading(true)
    setError(undefined)

    const run = () => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      getTools({ ...filters, limit }, controller.signal)
        .then((page) => {
          if (controller.signal.aborted || !liveRef.current) return
          setTools(page.items)
          setTotal(page.total)
          setCursor(page.nextCursor)
          setIsLoading(false)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          if (!liveRef.current) return
          setError(messageFor(cause))
          setIsLoading(false)
          // Results are cleared on failure ON PURPOSE. Leaving the previous
          // filter's tools on screen under a new filter would present them as
          // the answer to a question they do not answer.
          setTools([])
          setTotal(0)
          setCursor(undefined)
        })
    }

    if (debounceMs <= 0) {
      run()
      return
    }
    const timer = window.setTimeout(run, debounceMs)
    return () => window.clearTimeout(timer)
    // `filters` is intentionally absent: `key` is its identity. See above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt, debounceMs, limit])

  const loadMore = useCallback(() => {
    if (!cursor || isLoadingMore || isLoading) return
    setIsLoadingMore(true)

    // Deliberately NOT on controllerRef: aborting a "load more" when the first
    // page's controller is replaced would cancel a request the reader asked for.
    const controller = new AbortController()

    getTools({ ...filters, limit, cursor }, controller.signal)
      .then((page) => {
        if (!liveRef.current) return
        // Concatenate rather than replace — the cursor walks the same result set.
        setTools((current) => [...current, ...page.items])
        setTotal(page.total)
        setCursor(page.nextCursor)
        setIsLoadingMore(false)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (!liveRef.current) return
        setError(messageFor(cause))
        setIsLoadingMore(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, isLoadingMore, isLoading, key, limit])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    tools,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore: Boolean(cursor),
    loadMore,
    retry,
  }
}

export interface ToolResource {
  /** `null` means the catalogue answered and has no tool at that slug. */
  tool: Tool | null | undefined
  isLoading: boolean
  error: string | undefined
  retry: () => void
}

/**
 * One tool by slug.
 *
 * Nothing consumes this yet — there is no /tools/:slug route (see the report).
 * It exists because the endpoint does, and because the detail route and the
 * Milestone 4 sections both need exactly this and should not each write it.
 */
export function useTool(slug: string | undefined): ToolResource {
  const [tool, setTool] = useState<Tool | null | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!slug) {
      setTool(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setError(undefined)

    getToolBySlug(slug, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setTool(result)
        setIsLoading(false)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(messageFor(cause))
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [slug, attempt])

  return { tool, isLoading, error, retry: useCallback(() => setAttempt((n) => n + 1), []) }
}
