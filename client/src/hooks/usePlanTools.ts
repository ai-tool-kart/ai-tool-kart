import { useCallback, useEffect, useState } from 'react'
import { getToolIndex } from '@/services/tools'
import type { Tool } from '@/types/tool'

/*
 * Resolves an explicit, ordered list of slugs against the catalogue.
 *
 * This is what "See these tools" on the plan panel lands on: Browse filtered
 * to EXACTLY the plan's tools, never a text query standing in for them. The
 * catalogue is small enough that the shared slug index (services/tools.ts)
 * is the right tool for a known-keys lookup — see its own doc comment for why
 * that stops being true and what the upgrade looks like.
 */

export interface PlanToolsResource {
  tools: Tool[]
  isLoading: boolean
  error: string | undefined
  retry: () => void
}

export function usePlanTools(slugs: readonly string[]): PlanToolsResource {
  const [tools, setTools] = useState<Tool[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const key = slugs.join(',')

  useEffect(() => {
    if (!key) {
      setTools([])
      setIsLoading(false)
      setError(undefined)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(undefined)

    getToolIndex()
      .then((index) => {
        if (cancelled) return
        const wanted = key ? key.split(',') : []
        const found = wanted
          .map((slug) => index.get(slug))
          .filter((tool): tool is Tool => tool !== undefined)
        setTools(found)
        setIsLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Could not load these tools.')
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [key, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { tools, isLoading, error, retry }
}
