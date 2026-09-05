/*
 * Request validation.
 *
 * One helper: parse a Zod schema against a request part and turn a failure into
 * the API's INVALID_REQUEST shape, with `details.fields` naming exactly which
 * parameters were wrong and why.
 *
 * The reason this is a module rather than a try/catch at each route: the error
 * BODY is part of the API contract (ASSISTANT_ARCHITECTURE_PLAN.md §13), and a
 * contract enforced by convention at four call sites is a contract that has
 * already drifted at the fifth.
 *
 * Express 5 makes req.query a getter, so a route reads the validated object this
 * returns rather than expecting req.query to have been rewritten in place.
 */

import type { z } from 'zod'
import { invalidRequest } from '../domain/errors.ts'

/**
 * Parses `input` against `schema`, or throws INVALID_REQUEST.
 *
 * `source` names the request part ('query', 'body', 'params') so a client can
 * tell a bad query string from a bad body without guessing.
 */
/** Human wording for each request part. "params parameters" reads as a bug. */
const SOURCE_LABEL: Record<'query' | 'body' | 'params', string> = {
  query: 'query parameters',
  body: 'request body',
  params: 'path parameters',
}

export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  input: unknown,
  source: 'query' | 'body' | 'params',
): z.infer<T> {
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data

  const fields = parsed.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : source,
    message: issue.message,
  }))

  const summary = fields.map((field) => `${field.path}: ${field.message}`).join('; ')
  throw invalidRequest(`Invalid ${SOURCE_LABEL[source]} — ${summary}`, { source, fields })
}

/**
 * Splits a repeatable query parameter.
 *
 * Accepts both `?cat=Video&cat=Audio` (express gives an array) and
 * `?cat=Video,Audio` (one string), because both are things a client will send
 * and neither is worth a 400. Empty entries are dropped rather than becoming an
 * empty-string filter value that matches nothing.
 */
export function toStringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  const raw = Array.isArray(value) ? value : [value]
  const items = raw
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return items.length > 0 ? items : undefined
}
