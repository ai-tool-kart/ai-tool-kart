/*
 * Request logging and correlation ids.
 *
 * Every request gets an id, echoed in the X-Request-Id response header. The
 * completion line is emitted from the 'finish' event so it carries the real
 * status and duration, including for responses written by the error handler.
 *
 * The id lives in the header rather than in a typed res.locals slot on purpose:
 * the header is the one place both the error handler and the client can read it
 * from, and it needs no global Express type augmentation — which `namespace`
 * would require, and `erasableSyntaxOnly` forbids.
 *
 * Health checks are logged at debug. A liveness probe every few seconds would
 * otherwise drown the log in lines nobody reads.
 *
 * One subtlety worth stating: the path is captured from req.originalUrl at
 * entry, never read from req.path at finish time. Express rewrites req.url when
 * a request enters a mounted router, so by the time 'finish' fires, req.path for
 * GET /api/health has become "/". Reading it late both mislabels the log line
 * and defeats the health-check suppression below.
 */

import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { API_BASE_PATH, HEALTH } from '../config/limits.ts'
import type { Logger } from '../utils/logger.ts'

export const REQUEST_ID_HEADER = 'X-Request-Id'

const HEALTH_PATH = `${API_BASE_PATH}${HEALTH.path}`

/**
 * The full request path, stable regardless of router mounting.
 *
 * req.originalUrl is never rewritten, so this is correct from any middleware
 * at any depth — unlike req.path.
 */
export function requestPath(req: Request): string {
  const [path] = req.originalUrl.split('?')
  return path && path.length > 0 ? path : req.path
}

/** Reads the id this middleware assigned, for correlating a later log line. */
export function requestIdOf(res: Response): string | undefined {
  const value = res.getHeader(REQUEST_ID_HEADER)
  return typeof value === 'string' ? value : undefined
}

export interface RequestLoggerOptions {
  logger: Logger
}

export function createRequestLogger({ logger }: RequestLoggerOptions) {
  return function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID()
    const startedAt = process.hrtime.bigint()
    const method = req.method
    const path = requestPath(req)

    res.setHeader(REQUEST_ID_HEADER, requestId)

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
      const fields = {
        requestId,
        method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      }
      if (path === HEALTH_PATH) logger.debug('Request completed', fields)
      else logger.info('Request completed', fields)
    })

    next()
  }
}
