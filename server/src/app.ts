/*
 * Express application construction.
 *
 * Builds and returns the app. It does not read the environment, does not create
 * its dependencies and never listens on a port — index.ts owns the process and
 * container.ts owns the wiring. That separation is what lets a test build a
 * fully configured app against a silent logger and an in-memory config, with no
 * network and no global state (ASSISTANT_ARCHITECTURE_PLAN.md §15).
 *
 * Middleware order is load-bearing:
 *
 *   1. requestLogger  — assigns the id everything downstream logs against
 *   2. cors           — answers preflights before any body is parsed
 *   3. express.json   — bounded; its failures are mapped in errorHandler
 *   4. routes
 *   5. 404            — an unmatched path is an ApiError like any other
 *   6. errorHandler   — last, and the only place that writes an error body
 */

import express, { type Express } from 'express'
import { API_BASE_PATH, HTTP } from './config/limits.ts'
import type { Container } from './container.ts'
import { notFound } from './domain/errors.ts'
import { createCors } from './http/cors.ts'
import { createErrorHandler } from './http/errorHandler.ts'
import { createRequestLogger } from './http/requestLogger.ts'
import { createApiRouter } from './http/routes/index.ts'

export function createApp(container: Container): Express {
  const { env, logger } = container
  const app = express()

  // Never advertise the framework. Free, and one less version to fingerprint.
  app.disable('x-powered-by')

  // Trust the first proxy hop in production so req.ip and req.protocol reflect
  // the client rather than the load balancer. Left off in development, where
  // there is no proxy and trusting a header would let a client forge its own IP.
  if (env.isProduction) app.set('trust proxy', 1)

  app.use(createRequestLogger({ logger }))
  app.use(createCors({ allowedOrigins: env.cors.allowedOrigins }))
  app.use(express.json({ limit: HTTP.bodyLimit }))

  app.use(API_BASE_PATH, createApiRouter(container))

  app.use((req, _res, next) => {
    next(notFound(`No route matches ${req.method} ${req.path}.`))
  })

  app.use(createErrorHandler({ logger }))

  return app
}
