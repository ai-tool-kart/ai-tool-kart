/*
 * Shared test scaffolding.
 *
 * Everything here keeps tests offline and deterministic: a silent logger, an
 * in-memory config, and a server bound to an ephemeral loopback port. No test
 * may reach the public network or depend on a port being free.
 *
 * Mirrors news agent/tests/helpers.ts in intent and in the shape of its seams.
 */

import type { AddressInfo } from 'node:net'
import type { Express } from 'express'
import { createApp } from '../src/app.ts'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import type { ToolCatalogueRepository } from '../src/catalogue/repository.ts'
import type { ServerEnv } from '../src/config/env.ts'
import { createContainer, type Container } from '../src/container.ts'
import type { Tool } from '../src/domain/types.ts'
import { createLogger, type LogLevel, type Logger } from '../src/utils/logger.ts'

/**
 * A logger that writes nothing.
 *
 * Set TEST_LOGS=1 to see output while debugging a failing case.
 */
export function testLogger(level: LogLevel = 'debug'): Logger {
  if (process.env.TEST_LOGS === '1') return createLogger({ level, format: 'pretty' })
  return createLogger({ level, format: 'pretty', write: () => {} })
}

export interface CapturedLogger {
  logger: Logger
  /** Every rendered line, in order. */
  lines: string[]
  /** All lines joined — convenient for "must not contain" assertions. */
  text(): string
}

/** A logger that records what it rendered, for redaction and level assertions. */
export function capturingLogger(
  level: LogLevel = 'debug',
  format: 'json' | 'pretty' = 'pretty',
): CapturedLogger {
  const lines: string[] = []
  const logger = createLogger({
    level,
    format,
    write: (line) => {
      lines.push(line)
    },
  })
  return { logger, lines, text: () => lines.join('\n') }
}

/** A ServerEnv with development defaults; override only what a test cares about. */
export function testEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  const base: ServerEnv = {
    environment: 'test',
    isProduction: false,
    http: { host: '127.0.0.1', port: 0 },
    cors: { allowedOrigins: ['http://localhost:5173'] },
    log: { format: 'pretty', level: 'debug' },
  }
  return { ...base, ...overrides }
}

export function testContainer(
  env: ServerEnv = testEnv(),
  logger: Logger = testLogger(),
  catalogue?: ToolCatalogueRepository,
): Container {
  return createContainer({ env, logger, ...(catalogue ? { catalogue } : {}) })
}

/* ─── Catalogue fixtures ───────────────────────────────────────────────────── */

/**
 * A valid tool record with every field filled in, overridable field by field.
 *
 * Tests state only what they are actually testing. A fixture that forces each
 * test to restate twenty-five irrelevant fields is a fixture that gets copied
 * wrong, and then a test asserts against a record nobody read.
 */
export function makeTool(overrides: Partial<Tool> = {}): Tool {
  const id = overrides.id ?? overrides.slug ?? 'fixture-tool'
  return {
    id,
    name: 'Fixture Tool',
    mono: 'Ft',
    cat: 'Writing',
    model: 'Freemium',
    tagline: 'A fixture used by the server test-suite.',
    rating: 0,
    reviews: 0,
    price: 'Free tier + paid plans',
    trend: '',
    badge: '',
    tags: ['Fixture'],
    pop: 50,
    api: '—',
    ctx: '—',
    team: '—',
    trial: '—',
    integr: '—',
    slug: id,
    url: 'https://example.com',
    summary:
      'A fixture record used by the server test-suite. It exists to exercise the ' +
      'repository contract without depending on the real seed catalogue.',
    roles: ['Writer'],
    useCases: ['Draft an article'],
    stages: ['draft'],
    pricingTier: 'freemium',
    status: 'active',
    verified: true,
    ...overrides,
  }
}

/**
 * An in-memory ToolCatalogueRepository over a fixture array.
 *
 * Deliberately the REAL adapter with its file read bypassed, not a hand-written
 * stub. A stub would drift from the adapter's actual semantics — which is
 * precisely the behaviour the contract suite exists to pin down.
 */
export function fixtureCatalogue(tools: Tool[]): ToolCatalogueRepository {
  return createJsonToolCatalogue({ records: tools })
}

export interface TestServer {
  /** e.g. http://127.0.0.1:53124 — no trailing slash. */
  origin: string
  close(): Promise<void>
}

/**
 * Binds the app to an ephemeral loopback port.
 *
 * Port 0 lets the OS choose, so tests never collide with each other or with a
 * development server the reader happens to have running.
 */
export function startTestServer(app: Express): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1')

    server.once('error', reject)
    server.once('listening', () => {
      const address = server.address() as AddressInfo
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()))
          }),
      })
    })
  })
}

/**
 * Reads a JSON response as a declared shape.
 *
 * fetch's json() is typed Promise<unknown>, so every call site would otherwise
 * need its own cast. Taking the type parameter from the server's own exported
 * response interfaces means a test fails to compile when a contract changes,
 * which is the point.
 */
export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Starts a server for one test body and always closes it afterwards. */
export async function withServer(
  container: Container,
  body: (server: TestServer) => Promise<void>,
): Promise<void> {
  const server = await startTestServer(createApp(container))
  try {
    await body(server)
  } finally {
    await server.close()
  }
}
