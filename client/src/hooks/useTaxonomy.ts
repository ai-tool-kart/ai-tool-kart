import { useEffect, useState } from 'react'
import { getSetupTaxonomy } from '@/services/taxonomy'
import type { SetupTaxonomy } from '@/types/taxonomy'

/*
 * Roles and goals for the "Build Your AI Setup" pickers, from GET /api/taxonomy.
 *
 * Loaded once per mount and never refetched — the taxonomy is the catalogue's
 * vocabulary, not live data. There is deliberately no local fallback list: if
 * the request fails the pickers fall back to their FREE-TEXT mode, which the
 * design already provides ("Type your role…"), and the assistant accepts free
 * text for both fields anyway. A hardcoded copy of the list would look like it
 * worked while quietly drifting from the catalogue it is supposed to describe.
 */

export interface TaxonomyResource {
  data: SetupTaxonomy | undefined
  isLoading: boolean
  /** True once the request has failed; the pickers offer typing instead. */
  failed: boolean
}

export function useTaxonomy(): TaxonomyResource {
  const [data, setData] = useState<SetupTaxonomy | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    getSetupTaxonomy(controller.signal)
      .then((taxonomy) => {
        if (controller.signal.aborted) return
        setData(taxonomy)
        setIsLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFailed(true)
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [])

  return { data, isLoading, failed }
}
