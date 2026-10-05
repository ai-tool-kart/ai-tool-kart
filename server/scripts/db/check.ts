/*
 * npm run db:check — connect through Prisma and report what is there.
 *
 * Read-only. Prints the redacted target, the server version, applied
 * migrations, and row counts, so "is the database up and migrated?" has a
 * one-command answer.
 */

import { createDatabase } from '../../src/db/client.ts'
import { assertDatabaseTarget } from '../../src/db/target.ts'

const out = (line = '') => process.stdout.write(`${line}\n`)

try {
  const target = assertDatabaseTarget(process.env.DATABASE_URL)
  const db = createDatabase(process.env.DATABASE_URL as string)
  try {
    const [info] = await db.$queryRaw<{ version: string; database: string; user: string }[]>`
      SELECT version() AS version, current_database() AS database, current_user AS "user"`
    const migrations = await db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at`

    out(`Target:     ${target.redacted}${target.isLocal ? '  (local)' : '  (REMOTE)'}`)
    out(`Server:     ${info?.version.split(',')[0]}`)
    out(`Connected:  database=${info?.database} user=${info?.user}`)
    out(`Migrations: ${migrations.length}`)
    for (const m of migrations) out(`  ${m.finished_at ? '✓' : '✗ (unfinished)'} ${m.migration_name}`)
    out(
      `Rows:       tools=${await db.tool.count()} submissions=${await db.submission.count()} ` +
        `submission_events=${await db.submissionEvent.count()} data_import_runs=${await db.dataImportRun.count()}`,
    )
  } finally {
    await db.$disconnect()
  }
} catch (error) {
  process.stderr.write(`\n${(error as Error).message}\n\n`)
  process.exitCode = 1
}
