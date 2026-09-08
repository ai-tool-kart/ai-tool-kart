import { useEffect, useState } from 'react'
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
 * There is no `retry` and no reader-facing `error`. Every consumer so far draws
 * editorial content that stands on its own — a setup card is a real setup with
 * or without its tool tiles — so a failure degrades that card rather than
 * becoming the page's problem. A consumer that genuinely cannot render without
 * the catalogue should say so itself; `failed` is exposed for exactly that.
 */

export interface ToolIndexResource {
  /** Undefined until the catalogue has been read. */
  index: ToolIndex | undefined
  isLoading: boolean
  /** True once the read has failed. Consumers degrade rather than retry. */
  failed: boolean
}

export function useToolIndex(): ToolIndexResource {
  const [index, setIndex] = useState<ToolIndex | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // The shared read cannot be aborted (see services/tools.ts), so the unmount
    // guard is a flag rather than an AbortController.
    let live = true

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
  }, [])

  return { index, isLoading, failed }
}
