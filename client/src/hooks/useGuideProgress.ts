import { useCallback, useEffect, useState } from 'react'

/*
 * Where a reader is in one guide's workflow: the open step and the steps they
 * have marked done.
 *
 * Completed steps are remembered per guide in localStorage, so a reader who
 * leaves to run step 2 in another tab comes back to the same place. Storage
 * can be missing or throw (private mode, blocked site data); every access is
 * guarded and the stepper works the same without it.
 */

const STORAGE_PREFIX = 'aitk:guide-progress:'

function readCompleted(key: string, stepCount: number): number[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < stepCount)
  } catch {
    return []
  }
}

function writeCompleted(key: string, completed: number[]): void {
  try {
    if (completed.length) window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(completed))
    else window.localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    // Progress simply is not remembered.
  }
}

export interface GuideProgress {
  active: number
  completed: ReadonlySet<number>
  /** True once every step is marked done. */
  finished: boolean
  goTo: (index: number) => void
  /** Marks the open step done and opens the next one. */
  completeAndContinue: () => void
  reset: () => void
}

export function useGuideProgress(key: string, stepCount: number): GuideProgress {
  const [completed, setCompleted] = useState<number[]>(() => readCompleted(key, stepCount))
  const [active, setActive] = useState(() => {
    const done = new Set(readCompleted(key, stepCount))
    const firstOpen = Array.from({ length: stepCount }, (_, i) => i).find((i) => !done.has(i))
    return firstOpen ?? Math.max(0, stepCount - 1)
  })

  useEffect(() => writeCompleted(key, completed), [key, completed])

  const goTo = useCallback(
    (index: number) => setActive(Math.min(Math.max(index, 0), Math.max(0, stepCount - 1))),
    [stepCount],
  )

  const completeAndContinue = useCallback(() => {
    setCompleted((prev) => (prev.includes(active) ? prev : [...prev, active]))
    if (active < stepCount - 1) setActive(active + 1)
  }, [active, stepCount])

  const reset = useCallback(() => {
    setCompleted([])
    setActive(0)
  }, [])

  return {
    active,
    completed: new Set(completed),
    finished: stepCount > 0 && completed.length >= stepCount,
    goTo,
    completeAndContinue,
    reset,
  }
}
