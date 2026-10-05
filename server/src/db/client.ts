/*
 * The one place a PrismaClient is constructed.
 *
 * Prisma 7 talks to Postgres through a driver adapter (node-postgres here)
 * rather than a bundled query engine binary. The generated client lives in
 * src/generated/prisma (gitignored, produced by `npm run db:generate`).
 *
 * Not wired into container.ts yet: Phase 2A ships the schema, migrations and
 * the import tooling only. The catalogue and the submission store keep
 * reading their JSON files until the Postgres adapters replace them.
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'

export type Database = PrismaClient

export function createDatabase(connectionString: string): Database {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}
