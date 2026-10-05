/*
 * Request schemas for the auth routes. `.strict()` for the same reason as
 * submissions/schema.ts: an unknown key such as `"role":"ADMIN"` must be
 * rejected, never ignored, so registration cannot self-assign a role.
 *
 * Messages are written for the person at the form, keyed by field name.
 */

import { z } from 'zod'
import { AUTH } from '../config/limits.ts'

/**
 * The ONE email normalization: trim + lowercase the whole address.
 * Lowercasing the local part is technically lossy (RFC 5321 allows
 * case-sensitive mailboxes) but no real provider relies on it, and treating
 * Alice@ and alice@ as two accounts is far worse. No provider-specific
 * rules (Gmail dots, +tags): those would merge addresses that really are
 * distinct elsewhere. The users table enforces the result with a CHECK.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const EmailSchema = z
  .string({ message: 'Enter your email address.' })
  .trim()
  .min(1, { message: 'Enter your email address.' })
  .max(AUTH.maxEmailChars, { message: 'That email address is too long.' })
  .pipe(z.email({ message: 'Enter a valid email address, like name@example.com.' }))
  .transform(normalizeEmail)

/** Deliberately NOT trimmed: spaces are legal password characters. */
const NewPasswordSchema = z
  .string({ message: 'Choose a password.' })
  .min(AUTH.minPasswordChars, { message: `Use at least ${AUTH.minPasswordChars} characters.` })
  .max(AUTH.maxPasswordChars, { message: `Use ${AUTH.maxPasswordChars} characters or fewer.` })

export const RegisterSchema = z
  .object({
    email: EmailSchema,
    password: NewPasswordSchema,
    name: z
      .string()
      .trim()
      .max(AUTH.maxNameChars, { message: `Name must be ${AUTH.maxNameChars} characters or fewer.` })
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
  })
  .strict()

/**
 * Login is shape-checked only. Length rules belong to registration: a
 * login must not reveal a password policy (or reject an account created
 * under an older one) before the credentials are even compared.
 */
export const LoginSchema = z
  .object({
    email: z.string({ message: 'Enter your email address.' }).min(1, { message: 'Enter your email address.' }).max(AUTH.maxEmailChars).transform(normalizeEmail),
    password: z.string({ message: 'Enter your password.' }).min(1, { message: 'Enter your password.' }).max(AUTH.maxPasswordChars),
  })
  .strict()

export const RoleChangeSchema = z
  .object({
    /** TOOL_OWNER is never set by hand — it follows ownership (auth/ownership.ts). */
    role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN'], { message: 'Role must be USER, ADMIN or SUPER_ADMIN.' }),
  })
  .strict()

export const GrantOwnershipSchema = z
  .object({
    userId: z.uuid({ message: 'userId must be a user id.' }),
  })
  .strict()

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
