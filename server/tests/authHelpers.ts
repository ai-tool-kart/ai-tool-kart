/*
 * Helpers for the account tests: an app wired to an isolated database, a
 * minimal cookie jar for fetch, and fast user fixtures.
 *
 * FAST_SCRYPT keeps hashing ~1 ms instead of ~140 ms. The production
 * parameters are exercised directly in auth.unit.test.ts.
 */

import type { NextFunction, Request, Response as ExpressResponse } from 'express'
import { hashPassword, type ScryptParams } from '../src/auth/password.ts'
import { createContainer, type Container } from '../src/container.ts'
import type { ToolCatalogueRepository } from '../src/catalogue/repository.ts'
import type { Database } from '../src/db/client.ts'
import type { User, UserRole } from '../src/generated/prisma/client.ts'
import { fixtureCatalogue, testEnv, testLogger, withServer, type TestServer } from './helpers.ts'

export const FAST_SCRYPT: ScryptParams = { N: 2 ** 10, r: 8, p: 1, keyLength: 64, saltBytes: 16 }
export const TEST_PASSWORD = 'correct horse battery staple'
export const ALLOWED_ORIGIN = 'http://localhost:5173'

const noLimit = (_req: Request, _res: ExpressResponse, next: NextFunction) => next()

export interface AccountAppOptions {
  now?: () => Date
  loginLimiter?: (req: Request, res: ExpressResponse, next: NextFunction) => void
  submissionLimiter?: (req: Request, res: ExpressResponse, next: NextFunction) => void
  isProduction?: boolean
  catalogue?: ToolCatalogueRepository
}

export function accountContainer(db: Database, options: AccountAppOptions = {}): Container {
  return createContainer({
    env: testEnv({
      cors: { allowedOrigins: [ALLOWED_ORIGIN] },
      ...(options.isProduction ? { environment: 'production', isProduction: true } : {}),
    }),
    logger: testLogger('error'),
    catalogue: options.catalogue ?? fixtureCatalogue([]),
    database: db,
    accountOptions: {
      scryptParams: FAST_SCRYPT,
      loginLimiter: options.loginLimiter ?? noLimit,
      registerLimiter: noLimit,
      submissionLimiter: options.submissionLimiter ?? noLimit,
      ...(options.now ? { now: options.now } : {}),
    },
  })
}

export async function withAccountServer(
  db: Database,
  body: (server: TestServer) => Promise<void>,
  options: AccountAppOptions = {},
): Promise<void> {
  await withServer(accountContainer(db, options), body)
}

/** A browser stand-in: keeps cookies from Set-Cookie and sends them back. */
export class Client {
  readonly cookies = new Map<string, string>()
  lastSetCookie: string[] = []
  private readonly origin: string

  constructor(origin: string) {
    this.origin = origin
  }

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const response = await fetch(`${this.origin}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    this.lastSetCookie = response.headers.getSetCookie()
    for (const line of this.lastSetCookie) {
      const [pair] = line.split(';')
      const index = (pair as string).indexOf('=')
      const name = (pair as string).slice(0, index)
      const value = (pair as string).slice(index + 1)
      const expired = /max-age=0|expires=thu, 01 jan 1970/i.test(line)
      if (expired || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    return response
  }

  get(path: string) {
    return this.request('GET', path)
  }
  post(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request('POST', path, body, headers)
  }
}

let counter = 0
export function uniqueEmail(prefix = 'user'): string {
  counter += 1
  return `${prefix}-${process.pid}-${counter}@example.com`
}

/** Inserts a user directly (bypassing the API) with TEST_PASSWORD. */
export async function insertUser(db: Database, role: UserRole = 'USER', email = uniqueEmail(role.toLowerCase())): Promise<User> {
  return db.user.create({ data: { email, role, passwordHash: await hashPassword(TEST_PASSWORD, FAST_SCRYPT) } })
}

/** A Client signed in as a freshly inserted user of `role`. */
export async function signedInAs(db: Database, server: TestServer, role: UserRole = 'USER'): Promise<{ client: Client; user: User }> {
  const user = await insertUser(db, role)
  const client = new Client(server.origin)
  const response = await client.post('/auth/login', { email: user.email, password: TEST_PASSWORD })
  if (response.status !== 200) throw new Error(`login fixture failed: ${response.status}`)
  return { client, user }
}

/** A minimal valid catalogue row for ownership tests. */
export async function insertTool(db: Database, id: string): Promise<void> {
  await db.tool.create({
    data: {
      id,
      slug: id,
      name: id,
      mono: 'Te',
      cat: 'Writing',
      model: 'Free',
      tagline: 'A tool',
      rating: 0,
      reviews: 0,
      price: 'Free',
      trend: '',
      badge: '',
      tags: ['Writing'],
      pop: 10,
      api: '—',
      ctx: '—',
      team: '—',
      trial: '—',
      integr: '—',
      url: `https://${id}.example.com`,
      normalizedUrl: `${id}.example.com`,
      summary: 'A tool used in tests.',
      roles: ['Writer'],
      useCases: ['Draft an article'],
      stages: ['draft'],
      pricingTier: 'free',
    },
  })
}

export async function insertSubmission(db: Database, id: string, userId: string): Promise<void> {
  await db.submission.create({
    data: {
      id,
      userId,
      siteUrl: `https://${id}.example.com`,
      normalizedUrl: `${id}.example.com`,
      name: 'Submitted tool',
      tagline: 'Tagline',
      description: 'Description',
      category: 'Writing',
      pricingModel: 'Free',
      tags: [],
      alternatives: [],
      launchWeekId: '2026-11-16',
    },
  })
}
