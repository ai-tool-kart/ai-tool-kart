import { useEffect, useState } from 'react'
import { getWorkSavings } from '@/services/workSavings'
import type { WorkSavingsEstimate } from '@/types/workSavings'

/*
 * The role estimates behind "See What AI Can Save You".
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   SavingsSection → useWorkSavings → services/workSavings.ts
 *                                       → GET /api/work-savings (cached once)
 *
 * One request for the section. The catalogue is not read at all: an estimate is
 * keyed on a kind of work and references no tool, so this is the one homepage
 * section that does not touch the tool index.
 *
 * ── Failure is not fatal here ────────────────────────────────────────────────
 *
 * Unlike the story rail, this section does NOT stand down when its request
 * fails. The general comparison table is static editorial content that is
 * already on screen and still true; only the role selector loses its answers. So
 * `failed` is reported for the selector to degrade on, and the section itself
 * keeps rendering. That asymmetry is the whole reason the general table was kept
 * out of the endpoint — see data/savings.ts.
 */

export interface WorkSavingsResource {
  /** Editorial order. Empty while loading and after a failed read. */
  estimates: WorkSavingsEstimate[]
  isLoading: boolean
  /** True once the request has failed. The selector degrades; the table stays. */
  failed: boolean
}

export function useWorkSavings(): WorkSavingsResource {
  const [estimates, setEstimates] = useState<WorkSavingsEstimate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // The shared request cannot be aborted (see services/workSavings.ts), so the
    // unmount guard is a flag rather than an AbortController.
    let live = true

    getWorkSavings()
      .then((items) => {
        if (!live) return
        setEstimates(items)
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

  return { estimates, isLoading, failed }
}
