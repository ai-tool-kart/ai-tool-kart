import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncResource } from '@/hooks/useBlogPosts'
import { ApiRequestError } from '@/services/http'
import {
  automationQueryString,
  getAutomation,
  getAutomations,
  MAX_AUTOMATIONS,
} from '@/services/automations'
import type { AutomationCard, AutomationDetail, AutomationFilters } from '@/types/automation'

/*
 * Automations data hooks — the list and one record.
 *
 * Modelled on hooks/useTools.ts: every filter is the server's, the hook
 * re-requests when the filters change, a stale request is aborted, and typing
 * is debounced by the caller (pass SEARCH_DEBOUNCE_MS from useTools). What it
 * leaves out is paging — the automations API has no cursor, so there is no
 * "load more" to own.
 */

export interface AutomationsResource {
  automations: AutomationCard[]
  /** Every match, from the server — may exceed `automations.length` at the cap. */
  total: number
  /** True while a filter set is loading — the skeleton state. */
  isLoading: boolean
  /** A reader-facing message, or undefined when the request succeeded. */
  error: string | undefined
  retry: () => void
}

function messageFor(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong while loading the automations.'
}

export interface UseAutomationsOptions {
  /** Debounce before the request fires. The list page passes this for typing. */
  debounceMs?: number
  limit?: number
}

export function useAutomations(
  filters: AutomationFilters,
  { debounceMs = 0, limit = MAX_AUTOMATIONS }: UseAutomationsOptions = {},
): AutomationsResource {
  const [automations, setAutomations] = useState<AutomationCard[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  // The filters object is rebuilt every render (it comes from the URL); its
  // serialised form is its identity, as in useTools.
  const key = automationQueryString({ ...filters, limit })

  const controllerRef = useRef<AbortController | undefined>(undefined)
  const liveRef = useRef(true)

  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    setError(undefined)

    const run = () => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      getAutomations({ ...filters, limit }, controller.signal)
        .then((page) => {
          if (controller.signal.aborted || !liveRef.current) return
          setAutomations(page.items)
          setTotal(page.total)
          setIsLoading(false)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          if (!liveRef.current) return
          setError(messageFor(cause))
          setIsLoading(false)
          // Cleared on failure on purpose: the previous filter's results are
          // not the answer to the new question.
          setAutomations([])
          setTotal(0)
        })
    }

    if (debounceMs <= 0) {
      run()
      return
    }
    const timer = window.setTimeout(run, debounceMs)
    return () => window.clearTimeout(timer)
    // `filters` is intentionally absent: `key` is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, debounceMs, limit])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { automations, total, isLoading, error, retry }
}

/**
 * One automation by niche and slug — the shape of useBlogPost:
 * `data` is undefined while loading and `null` when the API has no such
 * automation. Both keys are needed: slugs are unique within a niche only.
 */
export function useAutomation(
  niche: string | undefined,
  slug: string | undefined,
): AsyncResource<AutomationDetail | null> {
  const [data, setData] = useState<AutomationDetail | null | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!niche || !slug) {
      setData(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setData(undefined)
    setIsLoading(true)
    setError(undefined)

    getAutomation(niche, slug, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setData(result)
        setIsLoading(false)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(messageFor(cause))
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [niche, slug, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, isLoading, error, retry }
}
