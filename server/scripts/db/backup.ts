/*
 * npm run db:backup — pg_dump the DATABASE_URL database into server/backups/.
 *
 * Run before every `db:deploy` (production migrations) and before an import.
 * Refuses a non-local database unless DATABASE_ALLOW_REMOTE_HOST names its
 * host (src/db/target.ts).
 */

import { assertDatabaseTarget } from '../../src/db/target.ts'
import { pgDump } from './pgDump.ts'

try {
  const target = assertDatabaseTarget(process.env.DATABASE_URL)
  process.stdout.write(`Backing up ${target.redacted}\n`)
  const file = await pgDump(process.env.DATABASE_URL as string, target, 'backup')
  process.stdout.write(`Wrote ${file}\nRestore with: pg_restore --clean --if-exists --no-owner --dbname <url> ${file}\n`)
} catch (error) {
  process.stderr.write(`\n${(error as Error).message}\n\n`)
  process.exitCode = 1
}
