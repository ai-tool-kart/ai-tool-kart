/*
 * Honeypot — SPEC-submit-backend.md §9, run as step 2 of §7's order: after
 * the rate limiter, before the zod parse that starts submissions/service.ts.
 *
 * A hidden `company` field real visitors never see or fill
 * (client/src/pages/SubmitPage.tsx — visually hidden, tabIndex -1,
 * aria-hidden, autoComplete off). A bot that blindly fills every input in a
 * form fills this one too. Answering it exactly like a real submission —
 * same shape, same 201, nothing stored — is the whole point: an error
 * response, or any response shaped differently from a normal submission,
 * would tell whatever filled it that it was caught.
 *
 * Runs on the raw body, ahead of SubmissionInputSchema, on purpose — the
 * SPEC's own step order puts it before the zod parse, so a bot whose payload
 * is otherwise garbage still gets waved through rather than a 400 that would
 * teach it which field to stop filling. No state, no config knob, so this is
 * a plain function rather than a rateLimit.ts-style factory.
 */

import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

function isTripped(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  const company = (body as Record<string, unknown>).company
  return typeof company === 'string' && company.trim() !== ''
}

export function honeypot(req: Request, res: Response, next: NextFunction): void {
  if (!isTripped(req.body)) {
    next()
    return
  }

  res.status(201).json({
    id: randomUUID(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  })
}
