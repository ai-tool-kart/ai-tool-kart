/*
 * Body parsing for the admin services: a zod failure becomes
 * VALIDATION_FAILED with per-field messages, the same `fields` shape the
 * Submit and auth forms already render (auth/service.ts fieldsFrom).
 */

import type { z } from 'zod'
import { validationFailed } from '../domain/errors.ts'

/** First message per field path. `prefix` namespaces nested payloads ("tool.slug"). */
export function fieldsFromZod(error: z.ZodError, prefix = ''): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.filter((part) => typeof part === 'string' || typeof part === 'number')
    const key = path.length > 0 ? `${prefix}${path.join('.')}` : prefix.replace(/\.$/, '') || '_'
    if (!(key in fields)) fields[key] = issue.message
  }
  return fields
}

export function parseBody<T extends z.ZodType>(schema: T, rawBody: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(rawBody)
  if (!parsed.success) throw validationFailed(message, fieldsFromZod(parsed.error))
  return parsed.data
}
