/*
 * Session tokens.
 *
 * The browser holds 256 random bits from the CSPRNG (base64url, in an
 * HttpOnly cookie). The database holds only SHA-256 of that token. A plain
 * hash is right here — unlike passwords, the input already has 256 bits of
 * entropy, so there is nothing to brute-force and no need for a slow KDF.
 * Lookup is by hash equality through a unique index.
 */

import { createHash, randomBytes } from 'node:crypto'
import { AUTH } from '../config/limits.ts'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function generateSessionToken(): string {
  return randomBytes(AUTH.sessionTokenBytes).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Cheap shape check before touching the database; a 32-byte base64url token is 43 chars. */
export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}
