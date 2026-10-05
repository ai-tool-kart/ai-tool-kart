/*
 * Password hashing — node:crypto scrypt, no dependency.
 *
 * Stored format, one self-describing string:
 *
 *   scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
 *
 * Carrying the parameters with each hash is what lets AUTH.scrypt be raised
 * later without invalidating a single existing password: verify() always
 * uses the parameters the hash was made with, and needsRehash() tells the
 * login flow to upgrade it while the plaintext is in hand.
 *
 *  - A fresh 16-byte salt from the CSPRNG per hash, so equal passwords never
 *    produce equal hashes.
 *  - Async scrypt: the work runs on libuv's threadpool, not the event loop.
 *    The threadpool's size (4 by default) also caps how many hashes — and
 *    how much of their 64 MiB each — can be in flight at once.
 *  - timingSafeEqual for the comparison.
 *  - Nothing here logs, and errors never include the password.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { AUTH } from '../config/limits.ts'

export interface ScryptParams {
  N: number
  r: number
  p: number
  keyLength: number
  saltBytes: number
}

const PREFIX = 'scrypt'

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

/** scrypt needs 128·N·r bytes; Node's default maxmem (32 MiB) is below N=2^16. */
function optionsFor(N: number, r: number, p: number): ScryptOptions {
  return { N, r, p, maxmem: 128 * N * r * 2 }
}

export async function hashPassword(password: string, params: ScryptParams = AUTH.scrypt): Promise<string> {
  const salt = randomBytes(params.saltBytes)
  const key = await scrypt(password.normalize('NFKC'), salt, params.keyLength, optionsFor(params.N, params.r, params.p))
  return [PREFIX, params.N, params.r, params.p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

interface ParsedHash {
  N: number
  r: number
  p: number
  salt: Buffer
  key: Buffer
}

function parseHash(stored: string): ParsedHash | undefined {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== PREFIX) return undefined
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  // Bounds stop a corrupted or hostile row from requesting absurd work.
  const valid =
    Number.isInteger(N) && N >= 2 ** 10 && N <= 2 ** 20 && (N & (N - 1)) === 0 &&
    Number.isInteger(r) && r >= 1 && r <= 32 &&
    Number.isInteger(p) && p >= 1 && p <= 16
  if (!valid) return undefined
  const salt = Buffer.from(parts[4] as string, 'base64url')
  const key = Buffer.from(parts[5] as string, 'base64url')
  if (salt.length < 16 || key.length < 32) return undefined
  return { N, r, p, salt, key }
}

/** False for a wrong password AND for a malformed stored hash — never throws on either. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored)
  if (!parsed) return false
  const candidate = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.key.length, optionsFor(parsed.N, parsed.r, parsed.p))
  return timingSafeEqual(candidate, parsed.key)
}

/** True when `stored` was made with weaker parameters than `current`. */
export function needsRehash(stored: string, current: ScryptParams = AUTH.scrypt): boolean {
  const parsed = parseHash(stored)
  if (!parsed) return true
  return parsed.N < current.N || parsed.r < current.r || parsed.p < current.p || parsed.key.length < current.keyLength
}
