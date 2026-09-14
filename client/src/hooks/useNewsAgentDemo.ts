/*
 * Dashboard state for one News Agent pipeline run.
 *
 * Holds three things: the environment descriptor (for the safety banner), the
 * current run snapshot, and the controls to start/reset a run. It deliberately
 * does not interpret pipeline state — the server's folded snapshot is the single
 * source of truth, and this hook only decides WHEN to refetch it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DemoApiError,
  fetchEnvironment,
  fetchRun,
  resetRun,
  startRun,
  subscribeToRun,
  type StartRunInput,
} from '@/services/newsAgentDemo'
import type { DemoEnvironment, RunState } from '@/types/newsAgentDemo'

export interface NewsAgentDemo {
  environment: DemoEnvironment | undefined
  environmentError: string | undefined
  run: RunState | undefined
  running: boolean
  /** Failure of the dashboard itself (server unreachable, run refused). */
  error: string | undefined
  start: (input: StartRunInput) => Promise<void>
  reset: () => Promise<void>
  reloadEnvironment: () => void
}

function messageFor(error: unknown): string {
  if (error instanceof DemoApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong talking to the demo server.'
}

export function useNewsAgentDemo(): NewsAgentDemo {
  const [environment, setEnvironment] = useState<DemoEnvironment | undefined>(undefined)
  const [environmentError, setEnvironmentError] = useState<string | undefined>(undefined)
  const [run, setRun] = useState<RunState | undefined>(undefined)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [envAttempt, setEnvAttempt] = useState(0)

  /*
   * Snapshot refetches are coalesced.
   *
   * A run emits events in bursts — one per source during ingestion, several per
   * story — and a fetch per event would queue behind itself. One in flight at a
   * time, with a trailing refetch if events arrived while it ran, keeps the view
   * current without a request storm.
   */
  const inFlight = useRef(false)
  const pending = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      pending.current = true
      return
    }
    inFlight.current = true
    try {
      const snapshot = await fetchRun()
      setRun(snapshot.run ?? undefined)
      setRunning(snapshot.running)
    } catch {
      // Transient during a run; the next event or the done frame recovers it.
    } finally {
      inFlight.current = false
      if (pending.current) {
        pending.current = false
        void refresh()
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setEnvironmentError(undefined)
    fetchEnvironment()
      .then((descriptor) => {
        if (!cancelled) setEnvironment(descriptor)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setEnvironmentError(messageFor(cause))
      })
    return () => {
      cancelled = true
    }
  }, [envAttempt])

  useEffect(() => {
    const unsubscribe = subscribeToRun({
      onSnapshot: (snapshot) => {
        setRun(snapshot.run ?? undefined)
        setRunning(snapshot.running)
      },
      onEvent: () => void refresh(),
      onDone: () => {
        setRunning(false)
        void refresh()
      },
      onError: () => {
        // EventSource reconnects on its own; a poll keeps the view honest
        // in the meantime.
        void refresh()
      },
    })
    return unsubscribe
  }, [refresh])

  const start = useCallback(
    async (input: StartRunInput) => {
      setError(undefined)
      try {
        await startRun(input)
        setRunning(true)
        await refresh()
      } catch (cause) {
        setError(messageFor(cause))
      }
    },
    [refresh],
  )

  const reset = useCallback(async () => {
    setError(undefined)
    try {
      await resetRun()
      setRun(undefined)
      setRunning(false)
    } catch (cause) {
      setError(messageFor(cause))
    }
  }, [])

  return {
    environment,
    environmentError,
    run,
    running,
    error,
    start,
    reset,
    reloadEnvironment: () => setEnvAttempt((n) => n + 1),
  }
}
