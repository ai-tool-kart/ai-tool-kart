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
import type { MockProviderOptions } from '../src/llm/providers/mock.ts'
import type { AssistantReply } from '../src/assistant/schema.ts'
import type { Tool, UsageStory, WorkSavingsEstimate } from '../src/domain/types.ts'
import { createJsonWorkSavingsRepository } from '../src/savings/json.ts'
import type { WorkSavingsRepository } from '../src/savings/repository.ts'
import { createJsonUsageStoryRepository } from '../src/stories/json.ts'
import type { UsageStoryRepository } from '../src/stories/repository.ts'
import type { SubmissionStore } from '../src/submissions/store.ts'
import type { NewSubmission } from '../src/submissions/types.ts'
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
    // The offline default. No test may reach a real provider or a network.
    llm: { provider: 'mock', timeoutMs: 60_000 },
  }
  return { ...base, ...overrides }
}

/**
 * A fully wired container against a silent logger and, optionally, a fixture
 * catalogue and a scripted provider.
 *
 * `mock` is how a test injects malformed output, a refusal or an outage. The
 * provider is REPLACED, never network-mocked: there is no network to intercept,
 * and a test that stubbed one would stop proving anything the moment an adapter
 * changed transport.
 */
export function testContainer(
  env: ServerEnv = testEnv(),
  logger: Logger = testLogger(),
  catalogue?: ToolCatalogueRepository,
  mock?: MockProviderOptions,
  stories?: UsageStoryRepository,
  savings?: WorkSavingsRepository,
  submissionStore?: SubmissionStore,
): Container {
  return createContainer({
    env,
    logger,
    ...(catalogue ? { catalogue } : {}),
    ...(mock ? { mock } : {}),
    ...(stories ? { stories } : {}),
    ...(savings ? { savings } : {}),
    ...(submissionStore ? { submissionStore } : {}),
  })
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

/* ─── Usage-story fixtures ─────────────────────────────────────────────────── */

/**
 * A valid usage story with every required field filled in, overridable field by
 * field. Same rationale as `makeTool`.
 *
 * `order` defaults to 0, so a test building several stories must give each its
 * own — which is what the schema requires anyway, and what keeps a fixture set's
 * sequence obvious in the test that wrote it.
 */
export function makeStory(overrides: Partial<UsageStory> = {}): UsageStory {
  return {
    id: 'fixture-story',
    role: 'Fixture Role',
    personName: 'Fixture P.',
    location: 'Nowhere',
    task: 'Do the thing the fixture exists to do.',
    toolSlugs: ['alpha-writer', 'beta-coder'],
    resultHeadline: 'The fixture did the thing.',
    resultDetail: 'Twice as fast as the fixture before it.',
    order: 0,
    ...overrides,
  }
}

/**
 * An in-memory UsageStoryRepository over a fixture array.
 *
 * The REAL adapter with its file read bypassed, not a stub — same reasoning as
 * `fixtureCatalogue`.
 */
export function fixtureStories(stories: UsageStory[]): UsageStoryRepository {
  return createJsonUsageStoryRepository({ records: stories })
}

/* ─── Work-savings fixtures ────────────────────────────────────────────────── */

/**
 * A valid work-savings estimate with every required field filled in.
 *
 * The three rows are Time, Cost and Effort in that order, because the schema
 * requires exactly that — a fixture that got it wrong would fail every test
 * using it rather than the one testing the rule.
 */
export function makeSavings(overrides: Partial<WorkSavingsEstimate> = {}): WorkSavingsEstimate {
  return {
    id: 'fixture-role',
    role: 'Fixture Role',
    hoursSavedPerWeek: 8,
    costSaved: '20–30%',
    effortSaved: 'Fixture work automated',
    rows: [
      { dimension: 'Time', without: '12 hrs/week on fixture work', withAi: '4 hrs/week' },
      { dimension: 'Cost', without: 'Paying for fixture work twice', withAi: 'One fixture stack' },
      { dimension: 'Effort', without: 'Fixture work done by hand', withAi: 'Fixture work batched' },
    ],
    order: 0,
    ...overrides,
  }
}

/**
 * An in-memory WorkSavingsRepository over a fixture array.
 *
 * The REAL adapter with its file read bypassed, not a stub — same reasoning as
 * `fixtureCatalogue` and `fixtureStories`.
 */
export function fixtureSavings(estimates: WorkSavingsEstimate[]): WorkSavingsRepository {
  return createJsonWorkSavingsRepository({ records: estimates })
}

/* ─── Submission fixtures (SPEC-submit-backend.md) ─────────────────────────── */

/**
 * A valid NewSubmission with every required field filled in, overridable
 * field by field. Same rationale as makeTool: a test states only what it is
 * actually testing.
 */
export function makeSubmission(overrides: Partial<NewSubmission> = {}): NewSubmission {
  return {
    siteUrl: 'https://example.com',
    normalizedUrl: 'example.com',
    name: 'Fixture Tool',
    tagline: 'A fixture used by the server test-suite.',
    description:
      'A fixture submission used to exercise the store without depending on real intake.',
    category: 'Writing',
    pricingModel: 'Freemium',
    tags: [],
    alternatives: [],
    faqs: [],
    plan: 'free',
    launchWeekId: '2026-11-16',
    ...overrides,
  }
}

/**
 * A valid raw submission REQUEST BODY — the shape a client actually POSTs,
 * before normalizeUrl or the store add anything server-side. Distinct from
 * makeSubmission's NewSubmission: a real request body has no normalizedUrl,
 * id, status or createdAt at all, and schema.test.ts needs to inject
 * invalid values (wrong types, missing keys, extra keys) that would not
 * type-check against a strict interface — hence the loose return type.
 */
export function makeSubmissionPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    siteUrl: 'https://example.com',
    name: 'Fixture Tool',
    tagline: 'A fixture used by the server test-suite.',
    description:
      'A fixture submission used to exercise the schema without depending on real intake.',
    category: 'Writing',
    pricingModel: 'Freemium',
    tags: [],
    alternatives: [],
    faqs: [],
    plan: 'free',
    launchWeekId: '2026-11-16',
    ...overrides,
  }
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

/* ─── Assistant fixtures (Phase E) ─────────────────────────────────────────── */

/**
 * A schema-valid model reply, overridable field by field.
 *
 * Grounding and engine tests are about what happens to a reply AFTER it
 * validates, so every one of them needs a valid starting point. Building it here
 * means a change to the contract breaks one function rather than fifteen
 * literals, and — because the return type is the real `AssistantReply` — a test
 * that drifts from the schema stops compiling instead of silently asserting
 * against a shape the engine would have rejected.
 */
export function makeAssistantReply(overrides: Partial<AssistantReply> = {}): AssistantReply {
  const base: AssistantReply = {
    message: 'Here is a stack for that.',
    intent: 'recommend',
    understood: { constraints: [] },
    plan: {
      title: 'Video workflow',
      toolIds: ['beta-editor'],
      agents: [],
      workflow: [{ stage: 'edit', toolId: 'beta-editor', why: 'It cuts long video down.' }],
      prompts: 'Starter prompts for the first cut',
      comparison: 'Beta Editor on one upload',
      steps: ['Upload a recording to Beta Editor.'],
    },
    followUps: ['Compare the top two'],
  }
  return { ...base, ...overrides }
}

/** A mock script that makes the provider answer with exactly this reply. */
export function scriptReply(reply: AssistantReply): MockProviderOptions {
  return { script: [{ kind: 'text', text: JSON.stringify(reply) }] }
}
