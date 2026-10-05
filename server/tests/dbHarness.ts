/*
 * An isolated, fully migrated Postgres schema per test file.
 *
 * node --test runs test files in parallel processes, so database tests that
 * shared one set of tables would truncate each other's fixtures. Instead each
 * file calls createTestDatabase(), which:
 *
 *   1. creates a uniquely named schema in TEST_DATABASE_URL's database
 *   2. applies every prisma/migrations/*\/migration.sql to it, in order —
 *      the real migrations, so the tests exercise the real constraints,
 *      indexes and triggers
 *   3. returns a Prisma client bound to that schema
 *
 * and drop() removes the schema afterwards.
 *
 * Only ever runs against a LOCAL database (src/db/target.ts). Database tests
 * are skipped when TEST_DATABASE_URL is unset — see dbSkipReason.
 */

import { randomBytes } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { createDatabase, type Database } from '../src/db/client.ts'
import { describeDatabaseUrl } from '../src/db/target.ts'

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations')

/** Pass as `{ skip: dbSkipReason }` to a top-level test. */
export const dbSkipReason: string | false = (() => {
  const url = process.env.TEST_DATABASE_URL
  if (!url) return 'TEST_DATABASE_URL not set'
  return describeDatabaseUrl(url).isLocal ? false : 'TEST_DATABASE_URL is not a local database; refusing to use it'
})()

export interface TestDatabase {
  db: Database
  schema: string
  drop(): Promise<void>
}

async function migrationScripts(): Promise<string[]> {
  const dirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  return Promise.all(dirs.map((dir) => readFile(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8')))
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const url = process.env.TEST_DATABASE_URL
  if (!url || dbSkipReason) throw new Error(`Database tests cannot run: ${dbSkipReason}`)

  const schema = `test_${randomBytes(6).toString('hex')}`
  const admin = new pg.Client({ connectionString: url })
  await admin.connect()
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`)
    await admin.query(`SET search_path TO "${schema}"`)
    for (const script of await migrationScripts()) await admin.query(script)
  } finally {
    await admin.end()
  }

  const db = createDatabase(url, { schema })
  return {
    db,
    schema,
    async drop() {
      await db.$disconnect()
      const cleanup = new pg.Client({ connectionString: url })
      await cleanup.connect()
      try {
        await cleanup.query(`DROP SCHEMA "${schema}" CASCADE`)
      } finally {
        await cleanup.end()
      }
    },
  }
}
