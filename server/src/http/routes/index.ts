/*
 * Route table.
 *
 * Mounting only — no markup, no state, no business logic, mirroring how
 * client/src/App.tsx keeps its route table free of everything but routes.
 *
 * Every router is handed collaborators from the container. None of them
 * constructs a dependency, and none names a concrete implementation
 * (ASSISTANT_ARCHITECTURE_PLAN.md §6.4).
 *
 * Phase I adds rate limiting in front of /assistant; nothing is reserved for it
 * here, because a middleware that does nothing is a middleware someone assumes
 * is already protecting them.
 */

import { Router } from 'express'
import {
  ASSISTANT,
  AUTH,
  AUTOMATIONS_API,
  HEALTH,
  SAVINGS_API,
  STORIES_API,
  SUBMISSIONS,
  TAXONOMY_API,
  TOOLS_API,
} from '../../config/limits.ts'
import type { Container } from '../../container.ts'
import { authUnavailable } from '../../domain/errors.ts'
import { createAuthenticate } from '../middleware/auth.ts'
import { createOriginCheck } from '../middleware/originCheck.ts'
import { createAdminRouter } from './admin.ts'
import { createAuthRouter } from './auth.ts'
import { createMeRouter } from './me.ts'
import { createAssistantRouter } from './assistant.ts'
import { createAutomationsRouter } from './automations.ts'
import { createHealthRouter } from './health.ts'
import { createSubmissionsRouter } from './submissions.ts'
import { createTaxonomyRouter, createToolsRouter } from './tools.ts'
import { createUsageStoriesRouter } from './usageStories.ts'
import { createWorkSavingsRouter } from './workSavings.ts'

export function createApiRouter(container: Container): Router {
  const router = Router()

  router.use(
    HEALTH.path,
    createHealthRouter({ env: container.env, catalogue: container.catalogue }),
  )
  router.use(
    TOOLS_API.path,
    createToolsRouter({ catalogue: container.catalogue, retrieval: container.retrieval }),
  )
  router.use(TAXONOMY_API.path, createTaxonomyRouter({ retrieval: container.retrieval }))
  router.use(STORIES_API.path, createUsageStoriesRouter({ stories: container.stories }))
  router.use(SAVINGS_API.path, createWorkSavingsRouter({ savings: container.savings }))
  router.use(
    AUTOMATIONS_API.path,
    createAutomationsRouter({
      automations: container.automations,
      matcher: container.automationMatcher,
    }),
  )
  router.use(ASSISTANT.path, createAssistantRouter({ engine: container.assistant }))
  router.use(SUBMISSIONS.path, createSubmissionsRouter({ service: container.submissions }))

  // Accounts. Only these routers resolve sessions; the public routes above
  // never touch the database for identity.
  const { accounts } = container
  if (accounts) {
    const authenticate = createAuthenticate(accounts.sessions, accounts.cookie)
    const originCheck = createOriginCheck(container.env.cors.allowedOrigins)
    router.use(
      AUTH.authPath,
      createAuthRouter({
        auth: accounts.auth,
        cookie: accounts.cookie,
        authenticate,
        originCheck,
        loginLimiter: accounts.loginLimiter,
        registerLimiter: accounts.registerLimiter,
      }),
    )
    router.use(AUTH.mePath, createMeRouter({ ownership: accounts.ownership, authenticate, originCheck }))
    router.use(
      AUTH.adminPath,
      createAdminRouter({ ownership: accounts.ownership, userAdmin: accounts.userAdmin, authenticate, originCheck }),
    )
  } else {
    // No DATABASE_URL: say so plainly rather than 404, which would read as
    // "this endpoint doesn't exist".
    const unavailable = Router().use((_req, _res, next) => {
      next(authUnavailable('Accounts are not available on this server right now.'))
    })
    router.use([AUTH.authPath, AUTH.mePath, AUTH.adminPath], unavailable)
  }

  return router
}
