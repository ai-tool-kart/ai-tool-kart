import { useCallback, useEffect, useState } from 'react'
import { getToolIndex, type ToolIndex } from '@/services/tools'

/*
 * The catalogue as a slug → Tool lookup, for surfaces that REFERENCE tools
 * rather than filter them.
 *
 * Backed by the shared, module-level read in services/tools.ts, so mounting this
 * in three places costs one fetch. It is the reference-resolution counterpart to
 * `useTools`, which is the filter-and-paginate one; both go through the same
 * service and neither is a second fetch path.
 *
 * There is no reader-facing `error` string. Every homepage consumer draws
 * editorial content that stands on its own — a setup card is a real setup with
 * or without its tool tiles — so a failure degrades that card rather than
 * becoming the page's problem. `failed` is exposed for exactly that.
 *
 * `retry` exists for the consumer that CANNOT degrade: New Launches is the
 * catalogue in chronological order, so a failed read is the whole page and it
 * owes the reader a way out. The shared promise in services/tools.ts clears its
 * slot on rejection, so re-running the effect genuinely re-fetches rather than
 * handing back the same rejected promise.
 */

export interface ToolIndexResource {
  /** Undefined until the catalogue has been read. */
  index: ToolIndex | undefined
  isLoading: boolean
  /** True once the read has failed. Most consumers degrade rather than retry. */
  failed: boolean
  /** Re-attempts the read. For pages that cannot render without the catalogue. */
  retry: () => void
}

export function useToolIndex(): ToolIndexResource {
  const [index, setIndex] = useState<ToolIndex | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    // The shared read cannot be aborted (see services/tools.ts), so the unmount
    // guard is a flag rather than an AbortController.
    let live = true
    setIsLoading(true)
    setFailed(false)

    getToolIndex()
      .then((resolved) => {
        if (!live) return
        setIndex(resolved)
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

  return { index, isLoading, failed, retry }
}
