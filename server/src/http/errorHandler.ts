/*
 * Central error handling.
 *
 * The mapping from a thrown value to a wire response is a pure function,
 * `toErrorResponse`. The Express middleware is a thin wrapper around it. That
 * split exists so the mapping can be tested exhaustively — including the cases
 * that are hard to provoke through a real request, like an unexpected throw
 * from deep in a future service — without stubbing req/res objects.
 *
 * The response contract is fixed by ASSISTANT_ARCHITECTURE_PLAN.md §13:
 *
 *   { "error": { "code": "...", "message": "..." } }
 *
 * Internal detail never crosses that boundary. A non-ApiError becomes a generic
 * INTERNAL, and an ApiError whose code is INTERNAL has its message replaced —
 * see the rule documented in domain/errors.ts.
 */

import type { NextFunction, Request, Response } from 'express'
import { ApiError, isApiError } from '../domain/errors.ts'
import { HTTP } from '../config/limits.ts'
import { errorFields, type Logger } from '../utils/logger.ts'
import { requestIdOf, requestPath } from './requestLogger.ts'

/** What a client is told when something we did not anticipate went wrong. */
export const INTERNAL_MESSAGE = 'Something went wrong. The error has been logged.'

export interface ErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export interface ErrorResponse {
  status: number
  body: ErrorBody
  /** True when the cause was unexpected and deserves an error-level log line. */
  unexpected: boolean
}

/**
 * Recognises the errors express.json() throws for a body it could not accept.
 *
 * These arrive as plain http-errors, not ApiErrors, but they are client
 * mistakes rather than server faults — reporting them as INTERNAL would both
 * mislead the caller and bury a real 500 in the logs.
 */
function fromBodyParser(error: unknown): ApiError | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { type?: unknown; status?: unknown }

  if (candidate.type === 'entity.too.large') {
    return new ApiError('INVALID_REQUEST', `Request body exceeds the ${HTTP.bodyLimit} limit.`, {
      status: 413,
      cause: error,
    })
  }

  if (candidate.type === 'entity.parse.failed') {
    return new ApiError('INVALID_REQUEST', 'Request body is not valid JSON.', { cause: error })
  }

  if (candidate.type === 'encoding.unsupported' || candidate.type === 'charset.unsupported') {
    return new ApiError('INVALID_REQUEST', 'Unsupported request body encoding.', {
      status: 415,
      cause: error,
    })
  }

  return undefined
}

/** Maps any thrown value onto the wire contract. Pure; never throws. */
export function toErrorResponse(error: unknown): ErrorResponse {
  const apiError = isApiError(error) ? error : fromBodyParser(error)

  if (!apiError) {
    return {
      status: 500,
      body: { error: { code: 'INTERNAL', message: INTERNAL_MESSAGE } },
      unexpected: true,
    }
  }

  if (apiError.code === 'INTERNAL' || apiError.code === 'CONFIG') {
    // Constructed by us, but its message describes our internals. Replace it.
    return {
      status: apiError.status,
      body: { error: { code: 'INTERNAL', message: INTERNAL_MESSAGE } },
      unexpected: true,
    }
  }

  const body: ErrorBody = { error: { code: apiError.code, message: apiError.message } }
  if (Object.keys(apiError.details).length > 0) {
    body.error.details = apiError.details
  }

  return { status: apiError.status, body, unexpected: false }
}

export interface ErrorHandlerOptions {
  logger: Logger
}

/**
 * Express error middleware.
 *
 * The four-argument signature is what marks it as an error handler, so `next`
 * must stay in the list even though the happy path never calls it.
 */
export function createErrorHandler({ logger }: ErrorHandlerOptions) {
  return function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    const { status, body, unexpected } = toErrorResponse(error)
    const log = logger.child({
      requestId: requestIdOf(res),
      method: req.method,
      path: requestPath(req),
    })

    if (unexpected) {
      log.error('Unhandled request failure', { status, ...errorFields(error) })
    } else {
      log.warn('Request rejected', { status, ...errorFields(error) })
    }

    if (res.headersSent) {
      // A response is already streaming; the only honest move is to end it.
      res.end()
      return
    }

    res.status(status).json(body)
  }
}
