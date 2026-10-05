/*
 * The one place a PrismaClient is constructed.
 *
 * Prisma 7 talks to Postgres through a driver adapter (node-postgres here)
 * rather than a bundled query engine binary. The generated client lives in
 * src/generated/prisma (gitignored, produced by `npm run db:generate`).
 *
 * Used by container.ts (accounts, Phase 2B) and the db scripts. The
 * catalogue and the submission store still read their JSON files until the
 * Postgres adapters replace them.
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'

export type Database = PrismaClient

export interface DatabaseOptions {
  /**
   * A Postgres schema other than `public`. Tests use it to give each test
   * file its own isolated copy of the tables (tests/dbHarness.ts). Applied to
   * Prisma's generated queries AND the connection's search_path, so raw SQL
   * resolves to the same tables.
   */
  schema?: string
}

export function createDatabase(connectionString: string, { schema }: DatabaseOptions = {}): Database {
  if (schema === undefined) return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid schema name "${schema}".`)
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }),
  })
}
