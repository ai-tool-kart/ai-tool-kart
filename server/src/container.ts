/*
 * The composition root.
 *
 * This is the ONE module that names a concrete implementation of anything.
 * Everything else receives its collaborators through an options object and
 * depends on interfaces — which is what makes the JSON-to-PostgreSQL catalogue
 * swap in ASSISTANT_ARCHITECTURE_PLAN.md §16.1 a one-line change here rather
 * than a rewrite of the retrieval and assistant layers.
 *
 * Manual constructor injection, exactly as executePipeline() wires the news
 * agent in news agent/src/pipeline/run.ts. No DI container, no service locator,
 * no decorators — `erasableSyntaxOnly` forbids the last of those anyway.
 *
 * `createJsonToolCatalogue` and `createProvider` are named HERE AND NOWHERE
 * ELSE. Routes and services receive a ToolCatalogueRepository and an LLMClient
 * and cannot tell what is behind either; swapping the catalogue for PostgreSQL
 * or the mock for a real vendor is one line below in each case.
 *
 * Nothing is stubbed here in advance. A placeholder that returns undefined is
 * a dependency the rest of the code learns to work around.
 *
 * ── One budget per TURN, not one per process ──────────────────────────────────
 *
 * Phase D created a single budget here, which was right when the only caller was
 * a manual verification path. It is wrong for a live chat endpoint: a budget is
 * mutable spend accounting, and one shared instance means the first pathological
 * conversation of the process exhausts every later request's headroom. The
 * symptom is unrelated users getting 503s from a healthy provider.
 *
 * So the container exposes a FACTORY. Every assistant turn calls it and gets a
 * fresh budget derived from LLM_BUDGET in config/limits.ts. The provider is
 * stateless and stays shared — it holds a credential and a base URL, not a
 * counter — and the client is a thin binding of the two, so making one per turn
 * costs an object allocation.
 *
 * This is a circuit breaker per unit of work, not a quota: there are no user
 * accounts to bill and no per-IP limiting until Phase I (§13).
 */

import { createAssistantEngine, type AssistantEngine } from './assistant/engine.ts'
import type { SessionCookieConfig } from './auth/cookies.ts'
import { createOwnershipService, type OwnershipService } from './auth/ownership.ts'
import type { ScryptParams } from './auth/password.ts'
import { createAuthService, type AuthService } from './auth/service.ts'
import { createSessionService, type SessionService } from './auth/sessions.ts'
import { createUserAdminService, type UserAdminService } from './auth/users.ts'
import { createJsonAutomations } from './automations/json.ts'
import { createAutomationMatcher, type AutomationMatcher } from './automations/match.ts'
import type { AutomationRepository } from './automations/repository.ts'
import { createJsonToolCatalogue } from './catalogue/json.ts'
import type { ToolCatalogueRepository } from './catalogue/repository.ts'
import type { ServerEnv } from './config/env.ts'
import { AUTH, LLM_BUDGET } from './config/limits.ts'
import { createDatabase, type Database } from './db/client.ts'
import { createRateLimiter } from './http/middleware/rateLimit.ts'
import type { RequestHandler } from 'express'
import { createBudget } from './llm/budget.ts'
import { createLLMClient, type LLMClient } from './llm/client.ts'
import { createProvider } from './llm/factory.ts'
import type { MockProviderOptions } from './llm/providers/mock.ts'
import { createRetrievalService, type RetrievalService } from './retrieval/service.ts'
import { createJsonWorkSavingsRepository } from './savings/json.ts'
import type { WorkSavingsRepository } from './savings/repository.ts'
import { createAccountSubmissionService, type AccountSubmissionService } from './submissions/accountService.ts'
import { createSubmissionService, type SubmissionService } from './submissions/service.ts'
import { createSubmissionStore, type SubmissionStore } from './submissions/store.ts'
import { createJsonUsageStoryRepository } from './stories/json.ts'
import type { UsageStoryRepository } from './stories/repository.ts'
import type { Logger } from './utils/logger.ts'

export interface Container {
  readonly env: ServerEnv
  readonly logger: Logger
  readonly catalogue: ToolCatalogueRepository
  readonly retrieval: RetrievalService
  /** Editorial usage stories. Independent of the catalogue; references it by slug. */
  readonly stories: UsageStoryRepository
  /** Editorial work-savings estimates. Keyed on a kind of work, not on a tool. */
  readonly savings: WorkSavingsRepository
  /** Imported task recipes (SPEC-automations.md). Never imports the catalogue. */
  readonly automations: AutomationRepository
  /** The one automation search index, built on first use. Route and assistant share it. */
  readonly automationMatcher: () => Promise<AutomationMatcher>
  /** One client, one budget, one unit of work. Never share the result. */
  readonly createLLMClientForTurn: () => LLMClient
  readonly assistant: AssistantEngine
  /** The Submit form's intake — SPEC-submit-backend.md §7's orchestration. */
  readonly submissions: SubmissionService
  /** The raw store behind `submissions` — the review script reads/writes this directly. */
  readonly submissionStore: SubmissionStore
  /**
   * Postgres, when DATABASE_URL is set (or a test injects one). Absent, the
   * server runs exactly as before and only the account routes answer 503.
   */
  readonly database?: Database
  /** Accounts, sessions, ownership. Present exactly when `database` is. */
  readonly accounts?: AccountServices
}

export interface AccountServices {
  readonly sessions: SessionService
  readonly auth: AuthService
  readonly ownership: OwnershipService
  readonly userAdmin: UserAdminService
  /** POST /api/submissions intake when accounts exist: Postgres, owned by the session's user. */
  readonly submissions: AccountSubmissionService
  readonly cookie: SessionCookieConfig
  readonly loginLimiter: RequestHandler
  readonly registerLimiter: RequestHandler
  /** Undefined means the submissions router builds its default limiter. */
  readonly submissionLimiter?: RequestHandler
}

/** Test seams for the account services. Production passes none of these. */
export interface AccountOptions {
  /** Cheaper scrypt so the suite stays fast. Never set outside tests. */
  scryptParams?: ScryptParams
  /** Clock for session expiry tests. */
  now?: () => Date
  loginLimiter?: RequestHandler
  registerLimiter?: RequestHandler
  /** POST /api/submissions limiter. Defaults to the intake's own (RATE_LIMIT). */
  submissionLimiter?: RequestHandler
}

export interface CreateContainerOptions {
  env: ServerEnv
  logger: Logger
  /**
   * Test seam.
   *
   * A test builds the whole app against a fixture catalogue by passing one in,
   * so route tests neither read the real seed file nor break every time a tool
   * is added to it.
   */
  catalogue?: ToolCatalogueRepository
  /**
   * Test seam for the usage stories.
   *
   * Same purpose as `catalogue`: route tests run against a small fixture set so
   * they neither read the real seed content nor break when a story is written.
   */
  stories?: UsageStoryRepository
  /** Test seam for the work-savings estimates. Same purpose as `stories`. */
  savings?: WorkSavingsRepository
  /** Test seam for the automations. Same purpose as `stories`. */
  automations?: AutomationRepository
  /**
   * Test seam for the submission store.
   *
   * Same purpose as `catalogue`: a route test points this at an isolated
   * `createJsonSubmissionStore(tempPath)` so it neither touches
   * server/data/submissions.json nor leaks state between test files.
   */
  submissionStore?: SubmissionStore
  /**
   * Test seam for Postgres. A test passes a client bound to its own isolated
   * schema (tests/dbHarness.ts). Otherwise one is created from DATABASE_URL.
   */
  database?: Database
  accountOptions?: AccountOptions
  /**
   * Test seam for the provider.
   *
   * Scripted mock behaviour — malformed output, refusals, outages — is injected
   * here rather than by intercepting the network, exactly as the News Agent
   * does. There is no network to intercept, and a test that stubs `fetch` is a
   * test that stops proving anything the moment an adapter changes transport.
   */
  mock?: MockProviderOptions
}

export function createContainer({
  env,
  logger,
  catalogue: injected,
  stories: injectedStories,
  savings: injectedSavings,
  automations: injectedAutomations,
  submissionStore: injectedSubmissionStore,
  database: injectedDatabase,
  accountOptions = {},
  mock,
}: CreateContainerOptions): Container {
  // The only line in the server that names a concrete catalogue implementation.
  const catalogue = injected ?? createJsonToolCatalogue({ logger })
  const retrieval = createRetrievalService({ catalogue, logger })

  // ...and the only line that names a concrete story implementation. Built here
  // rather than inside the catalogue: a story references tools by slug and the
  // catalogue knows nothing of stories, so neither one constructs the other.
  const stories = injectedStories ?? createJsonUsageStoryRepository({ logger })

  // ...and the only line naming a concrete savings implementation.
  const savings = injectedSavings ?? createJsonWorkSavingsRepository({ logger })

  // ...and the only line naming a concrete automations implementation. The
  // catalogue is not passed in: an automation embeds its tools and references
  // the catalogue only by slug (SPEC-automations.md §1).
  // The demo guide (automations/demo/) exists to exercise the editorial layer
  // locally. Development only: it must never be indexed in production.
  const automations =
    injectedAutomations ??
    createJsonAutomations({ logger, includeDemo: env.environment === 'development' })

  // ONE search index over the active automations, shared by GET
  // /api/automations and the assistant. Built on first use and kept: the set
  // is fixed for the life of the process, so a second index would repeat it.
  let automationIndex: Promise<AutomationMatcher> | undefined
  const automationMatcher = (): Promise<AutomationMatcher> => {
    automationIndex ??= automations.list().then((all) => createAutomationMatcher(all))
    return automationIndex
  }

  // createSubmissionStore() (submissions/store.ts) is itself the switch point
  // for a future Postgres implementation, so this line never has to name
  // store.json.ts directly — unlike catalogue/stories/savings above, which
  // have no such factory of their own yet.
  const submissionStore = injectedSubmissionStore ?? createSubmissionStore()
  const submissions = createSubmissionService({ store: submissionStore, catalogue })

  // ...and the only line that opens a Postgres connection. Lazy: Prisma
  // connects on the first query, so a database that is down at boot fails
  // the account routes, not the whole server.
  const database = injectedDatabase ?? (env.database ? createDatabase(env.database.url) : undefined)
  const accounts = database ? createAccountServices(database, env, logger, catalogue, accountOptions) : undefined

  // ...and the only line that names a concrete LLM provider. Stateless, so one
  // instance serves every request.
  const provider = createProvider({ env, logger, ...(mock ? { mock } : {}) })

  const createLLMClientForTurn = (): LLMClient =>
    createLLMClient({
      provider,
      budget: createBudget({
        maxLlmCalls: LLM_BUDGET.maxLlmCalls,
        maxTokens: LLM_BUDGET.maxTokens,
      }),
      logger,
    })

  const assistant = createAssistantEngine({
    retrieval,
    catalogue,
    createClient: createLLMClientForTurn,
    automations: automationMatcher,
    logger,
  })

  return {
    env,
    logger,
    catalogue,
    retrieval,
    stories,
    savings,
    automations,
    automationMatcher,
    createLLMClientForTurn,
    assistant,
    submissions,
    submissionStore,
    ...(database ? { database } : {}),
    ...(accounts ? { accounts } : {}),
  }
}

function createAccountServices(
  db: Database,
  env: ServerEnv,
  logger: Logger,
  catalogue: ToolCatalogueRepository,
  options: AccountOptions,
): AccountServices {
  const sessions = createSessionService({ db, logger, ...(options.now ? { now: options.now } : {}) })
  return {
    sessions,
    auth: createAuthService({
      db,
      sessions,
      ...(options.scryptParams ? { scryptParams: options.scryptParams } : {}),
      ...(options.now ? { now: options.now } : {}),
    }),
    ownership: createOwnershipService({ db }),
    userAdmin: createUserAdminService({ db, sessions }),
    submissions: createAccountSubmissionService({ db, catalogue }),
    // Secure cookies whenever the site is served over https — i.e. production.
    cookie: { secure: env.isProduction },
    loginLimiter:
      options.loginLimiter ??
      createRateLimiter({ ...AUTH.loginRateLimit, message: 'Too many sign-in attempts from this address. Try again later.' }),
    ...(options.submissionLimiter ? { submissionLimiter: options.submissionLimiter } : {}),
    registerLimiter:
      options.registerLimiter ??
      createRateLimiter({ ...AUTH.registerRateLimit, message: 'Too many accounts created from this address. Try again later.' }),
  }
}
