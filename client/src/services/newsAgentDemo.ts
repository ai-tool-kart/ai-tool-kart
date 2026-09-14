/*
 * Transport for the News Agent demo dashboard.
 *
 * Talks to the agent's local demo server (`npm run demo` in `news agent/`),
 * which is a SEPARATE process from the product API in `server/` — hence its own
 * base URL rather than services/http.ts.
 *
 * The dashboard never computes pipeline state: this module fetches the
 * environment descriptor, asks the server to start a run, and subscribes to the
 * run's event stream. Everything rendered comes back from the pipeline.
 */

import type { DemoEnvironment, RunState } from '@/types/newsAgentDemo'

const DEFAULT_BASE = 'http://localhost:4317/api/demo'

export const DEMO_API_BASE: string = (
  import.meta.env.VITE_NEWS_AGENT_DEMO_URL ?? DEFAULT_BASE
).replace(/\/$/, '')

export class DemoApiError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'DemoApiError'
    this.code = code
  }
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${DEMO_API_BASE}${path}`, {
      ...(body !== undefined
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    })
  } catch {
    throw new DemoApiError(
      `Could not reach the News Agent demo server at ${DEMO_API_BASE}. ` +
        'Start it with: cd "news agent" && npm run demo',
      'NETWORK',
    )
  }

  if (!response.ok) {
    let code = 'INTERNAL'
    let message = `The demo server responded ${response.status}.`
    try {
      const envelope = (await response.json()) as ErrorEnvelope
      if (typeof envelope.error?.code === 'string') code = envelope.error.code
      if (typeof envelope.error?.message === 'string') message = envelope.error.message
    } catch {
      // Keep the status-derived message.
    }
    throw new DemoApiError(message, code)
  }

  return (await response.json()) as T
}

export function fetchEnvironment(): Promise<DemoEnvironment> {
  return request<DemoEnvironment>('/environment')
}

export interface StartRunInput {
  /** Restrict ingestion to one source id, matching `npm run agent -- --source=`. */
  sourceId?: string
  /** Articles to generate this run. The demo default is 1. */
  limit?: number
  /** Everything except WordPress writes. */
  dryRun?: boolean
}

export function startRun(input: StartRunInput): Promise<{ runId: string }> {
  return request<{ runId: string }>('/run', input)
}

export function fetchRun(): Promise<{ run: RunState | null; running: boolean }> {
  return request<{ run: RunState | null; running: boolean }>('/run')
}

export function resetRun(): Promise<{ ok: true }> {
  return request<{ ok: true }>('/reset', {})
}

export interface StreamHandlers {
  /** Full snapshot, sent when the stream opens — so a late subscriber sees everything. */
  onSnapshot: (snapshot: { run: RunState | null; running: boolean }) => void
  /** One pipeline event. The caller refetches the snapshot rather than folding it. */
  onEvent: () => void
  onDone: () => void
  onError: () => void
}

/**
 * Subscribes to the run event stream.
 *
 * SSE is the simplest mechanism that fits: the demo server already holds the run
 * in memory, and one long-lived GET avoids both polling latency and a WebSocket
 * dependency the project does not otherwise have.
 *
 * Events arrive as notifications; the snapshot is then refetched. That keeps a
 * single source of truth (the server's folded state) instead of reimplementing
 * `demo/state.ts` in the browser, at the cost of one cheap local request per
 * event — which is the right trade for a localhost demo.
 */
export function subscribeToRun(handlers: StreamHandlers): () => void {
  const source = new EventSource(`${DEMO_API_BASE}/events`)

  source.addEventListener('snapshot', (event) => {
    try {
      handlers.onSnapshot(JSON.parse((event as MessageEvent).data))
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  })
  source.addEventListener('pipeline', () => handlers.onEvent())
  source.addEventListener('done', () => handlers.onDone())
  source.onerror = () => handlers.onError()

  return () => source.close()
}
