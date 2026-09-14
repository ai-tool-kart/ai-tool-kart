/*
 * Local demo/observability server for the News Agent.
 *
 * NEWS_AGENT.md §1 says the agent is a batch job with no HTTP surface, and that
 * exposing the pipeline over HTTP needs a separate decision. This IS that
 * decision, scoped as narrowly as it can be:
 *
 *   - a SEPARATE entry point, not folded into server/ (the product API) and not
 *     reachable from `npm run agent`
 *   - bound to 127.0.0.1 only, so it is not on the network
 *   - read-only with respect to configuration; it never writes .env
 *   - it REFUSES to run the pipeline against a non-local WordPress (§ environment.ts)
 *
 * It runs the real pipeline in-process with an observer attached. There is no
 * second implementation of any pipeline stage here — this file starts a run,
 * folds its events into a snapshot, and serves that snapshot.
 *
 * Dependencies: node:http only. Adding express to the agent package for a demo
 * surface would not be justified.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { describeEnv, loadEnv, type AgentEnv } from '../config/env.ts'
import { isAgentError } from '../domain/errors.ts'
import { executePipeline } from '../pipeline/run.ts'
import type { PipelineEvent, PipelineObserver } from '../pipeline/observer.ts'
import { SOURCES } from '../sources/registry.ts'
import { openDatabase } from '../storage/db.ts'
import { createRepositories, type Repositories } from '../storage/repositories.ts'
import { createLogger, redact, type LogLevel } from '../utils/logger.ts'
import { describeEnvironment, editorUrlFor } from './environment.ts'
import { applyEvent, emptyRunState, markFailed, type DemoRunState } from './state.ts'

const PORT = Number.parseInt(process.env.NEWS_AGENT_DEMO_PORT ?? '4317', 10)
const HOST = '127.0.0.1'

/** Only a Vite dev server on this machine may call it. */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

interface Subscriber {
  id: string
  response: ServerResponse
}

interface DemoState {
  current?: DemoRunState
  /** Every event of the current run, replayed to a client that connects late. */
  events: PipelineEvent[]
  running: boolean
  subscribers: Subscriber[]
}

function main(): void {
  let loaded
  try {
    loaded = loadEnv()
  } catch (error) {
    process.stderr.write(`\nConfiguration error:\n${(error as Error).message}\n\n`)
    process.exitCode = 1
    return
  }

  const { env, warnings } = loaded
  const logger = createLogger({ level: env.log.level, format: 'pretty' })
  for (const warning of warnings) logger.warn(warning)

  const db = openDatabase({ path: env.dbPath })
  const repos = createRepositories(db)

  const state: DemoState = { events: [], running: false, subscribers: [] }

  const server = createServer((request, response) => {
    handle(request, response, { env, repos, state, logger }).catch((error: unknown) => {
      logger.error('Demo request failed', { err: error instanceof Error ? error.message : String(error) })
      if (!response.headersSent) sendJson(response, 500, { error: { code: 'INTERNAL', message: 'Request failed.' } })
    })
  })

  server.listen(PORT, HOST, () => {
    const descriptor = describeEnvironment(env, sourceList())
    logger.plain('')
    logger.plain('  News Agent — demo dashboard API')
    logger.plain(`  http://${HOST}:${PORT}/api/demo`)
    logger.plain('')
    logger.plain(`  Environment:  LOCAL DEVELOPMENT`)
    logger.plain(`  WordPress:    ${descriptor.wordpress.apiUrl ?? '(not configured)'} [${descriptor.wordpress.locality}]`)
    logger.plain(`  LLM provider: ${descriptor.llm.provider}`)
    logger.plain('')
    if (!descriptor.canRun) {
      logger.warn('Publishing runs are BLOCKED', { reason: descriptor.blockedReason })
      logger.plain('')
    }
    logger.info('Demo server ready', describeEnv(env))
  })

  const shutdown = () => {
    for (const subscriber of state.subscribers) subscriber.response.end()
    server.close(() => {
      repos.close()
      process.exit(0)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

function sourceList() {
  return SOURCES.map((source) => ({
    id: source.id,
    name: source.name,
    publisher: source.publisher,
    trustTier: source.trustTier,
    url: source.url,
    enabled: source.enabled,
    ...(source.note ? { note: source.note.replace(/\s+/g, ' ') } : {}),
  }))
}

interface HandlerDeps {
  env: AgentEnv
  repos: Repositories
  state: DemoState
  logger: ReturnType<typeof createLogger>
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  deps: HandlerDeps,
): Promise<void> {
  const origin = request.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('vary', 'origin')
  }
  response.setHeader('access-control-allow-headers', 'content-type')
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end()
    return
  }

  const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (request.method === 'GET' && path === '/api/demo/environment') {
    sendJson(response, 200, describeEnvironment(deps.env, sourceList()))
    return
  }

  if (request.method === 'GET' && path === '/api/demo/run') {
    sendJson(response, 200, { run: deps.state.current ?? null, running: deps.state.running })
    return
  }

  if (request.method === 'GET' && path === '/api/demo/events') {
    subscribe(response, deps)
    return
  }

  if (request.method === 'POST' && path === '/api/demo/run') {
    await startRun(request, response, deps)
    return
  }

  if (request.method === 'POST' && path === '/api/demo/reset') {
    if (deps.state.running) {
      sendJson(response, 409, {
        error: { code: 'RUN_ACTIVE', message: 'A run is still in progress. Wait for it to finish before resetting.' },
      })
      return
    }
    deps.state.current = undefined
    deps.state.events = []
    sendJson(response, 200, { ok: true })
    return
  }

  sendJson(response, 404, { error: { code: 'NOT_FOUND', message: `No demo route for ${path}.` } })
}

/* ── starting a run ───────────────────────────────────────────────────────── */

async function startRun(
  request: IncomingMessage,
  response: ServerResponse,
  deps: HandlerDeps,
): Promise<void> {
  const { env, repos, state } = deps

  if (state.running) {
    sendJson(response, 409, {
      error: { code: 'RUN_ACTIVE', message: 'A pipeline run is already in progress.' },
    })
    return
  }

  let body: { sourceId?: string; limit?: number; dryRun?: boolean } = {}
  try {
    body = await readJson(request)
  } catch {
    sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'Body must be JSON.' } })
    return
  }

  const dryRun = body.dryRun === true

  /*
   * The environment gate. A publishing run is refused unless the configured CMS
   * is a local development host; a dry run is always allowed because it cannot
   * reach WordPress at all (pipeline/run.ts never builds a client for one).
   */
  if (!dryRun) {
    const descriptor = describeEnvironment(env, [])
    if (!descriptor.canRun) {
      sendJson(response, 412, {
        error: { code: 'ENVIRONMENT_BLOCKED', message: descriptor.blockedReason as string },
      })
      return
    }
  }

  const limit =
    typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0
      ? body.limit
      : 1
  const sourceId = typeof body.sourceId === 'string' && body.sourceId ? body.sourceId : undefined

  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  state.current = emptyRunState(runId, startedAt, dryRun)
  state.events = []
  state.running = true

  const observer: PipelineObserver = {
    emit(rawEvent) {
      /*
       * The pipeline reports the post id and the REST base it used; the
       * dashboard's "Open WordPress Draft" button needs the wp-admin editor
       * screen. Deriving it here keeps URL-shape knowledge out of the pipeline
       * and out of the browser.
       */
      const event =
        rawEvent.type === 'story:wordpress' &&
        rawEvent.result.status === 'created' &&
        rawEvent.result.wpPostId &&
        rawEvent.result.baseUrl
          ? {
              ...rawEvent,
              result: {
                ...rawEvent.result,
                editorUrl: editorUrlFor(rawEvent.result.baseUrl, rawEvent.result.wpPostId),
              },
            }
          : rawEvent

      state.events.push(event)
      if (state.current) applyEvent(state.current, event)
      broadcast(state, event)
    },
  }

  /*
   * The run's logger tees into the observer.
   *
   * This is where the "Technical Activity" panel comes from, and why it is safe:
   * these are the agent's own log lines, already passed through the redactor
   * that scrubs registered secrets and Authorization headers. Prompts, source
   * bodies and provider payloads are never logged by the agent in the first
   * place (llm/client.ts logs token counts, not content).
   */
  const runLogger = createLogger({
    level: 'info',
    format: 'pretty',
    write: (line, level) => {
      process.stdout.write(`${line}\n`)
      observer.emit({ type: 'log', at: new Date().toISOString(), level: level as LogLevel, message: redact(line) })
    },
  })

  sendJson(response, 202, { runId, accepted: true })

  executePipeline({ env, repos, logger: runLogger, dryRun, observer, limit, ...(sourceId ? { sourceId } : {}) })
    .then(({ run }) => {
      deps.logger.info('Demo run finished', { runId, status: run.status })
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      const hint = isAgentError(error) && error.code === 'CONFIG' ? 'Check news agent/.env.demo.' : undefined
      if (state.current) markFailed(state.current, message, hint)
      deps.logger.error('Demo run failed', { runId, err: message })
      broadcast(state, {
        type: 'log',
        at: new Date().toISOString(),
        level: 'error',
        message: redact(`Pipeline failed: ${message}`),
      })
    })
    .finally(() => {
      state.running = false
      // A terminal frame so the browser can close the stream rather than wait.
      broadcastRaw(state, 'done', { runId })
    })
}

/* ── SSE ──────────────────────────────────────────────────────────────────── */

function subscribe(response: ServerResponse, deps: HandlerDeps): void {
  const { state } = deps
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })

  const subscriber: Subscriber = { id: randomUUID(), response }
  state.subscribers.push(subscriber)

  // Replay: a client that connects mid-run gets the whole story, not the tail.
  response.write(`event: snapshot\ndata: ${JSON.stringify({ run: state.current ?? null, running: state.running })}\n\n`)

  // Comment frames keep proxies and the browser from closing an idle stream.
  const heartbeat = setInterval(() => response.write(': ping\n\n'), 15_000)

  response.on('close', () => {
    clearInterval(heartbeat)
    const index = state.subscribers.findIndex((entry) => entry.id === subscriber.id)
    if (index >= 0) state.subscribers.splice(index, 1)
  })
}

function broadcast(state: DemoState, event: PipelineEvent): void {
  broadcastRaw(state, 'pipeline', event)
}

function broadcastRaw(state: DemoState, name: string, payload: unknown): void {
  let data: string
  try {
    data = JSON.stringify(payload)
  } catch {
    return
  }
  const frame = `event: ${name}\ndata: ${data}\n\n`
  for (const subscriber of state.subscribers) {
    try {
      subscriber.response.write(frame)
    } catch {
      // A dropped client is not an error worth surfacing.
    }
  }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += (chunk as Buffer).length
    if (bytes > 64_000) throw new Error('Body too large')
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {} as T
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}


main()
