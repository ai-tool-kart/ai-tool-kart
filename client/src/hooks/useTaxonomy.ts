import { useCallback, useEffect, useState } from 'react'
import { getTaxonomy } from '@/services/taxonomy'
import type { Taxonomy } from '@/types/taxonomy'

/*
 * The catalogue vocabulary, for whoever needs it.
 *
 * Backed by the module-level cache in services/taxonomy.ts, so mounting this in
 * three places costs one request. There is deliberately no local fallback list:
 * if the request fails, consumers degrade to something honest — the Browse chip
 * row renders no chips rather than chips that would 400, and the assistant's
 * setup pickers fall back to their free-text mode. A hardcoded copy would look
 * like it worked while drifting from the catalogue it claims to describe.
 */

export interface TaxonomyResource {
  data: Taxonomy | undefined
  isLoading: boolean
  /** True once the request has failed; consumers offer their degraded path. */
  failed: boolean
  /**
   * Re-attempts the request.
   *
   * The vocabulary and the catalogue come from two endpoints, so one outage
   * fails both — and a "Try again" that revived only the results would leave
   * the page with tools but no filter chips and a dead sort control. Browse
   * calls this alongside the catalogue's own retry.
   */
  retry: () => void
}

export function useTaxonomy(): TaxonomyResource {
  const [data, setData] = useState<Taxonomy | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // The shared request cannot be aborted (see services/taxonomy.ts), so the
    // unmount guard is a flag rather than an AbortController.
    let live = true
    setFailed(false)

    getTaxonomy()
      .then((taxonomy) => {
        if (!live) return
        setData(taxonomy)
        setIsLoading(false)
      })
      .catch(() => {
        if (!live) return
        setFailed(true)
        setIsLoading(false)
      })

    return () => {
      live = false
    }
  }, [attempt])

  const retry = useCallback(() => {
    setIsLoading(true)
    setAttempt((n) => n + 1)
  }, [])

  return { data, isLoading, failed, retry }
}
