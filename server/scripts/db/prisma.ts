/*
 * Runs the Prisma CLI after checking which database it is about to touch.
 *
 *   npm run db:migrate   → prisma migrate dev     LOCAL ONLY, always
 *   npm run db:deploy    → prisma migrate deploy  local, or a remote host named
 *                                                 in DATABASE_ALLOW_REMOTE_HOST
 *   npm run db:status    → prisma migrate status
 *
 * `migrate dev` can reset a database when it detects drift, so it never
 * runs against a non-local host, whatever DATABASE_ALLOW_REMOTE_HOST says.
 * Prisma 7 no longer reads .env itself; the npm script loads it with
 * --env-file-if-exists, and the real environment (Railway) wins over it.
 */

import { spawn } from 'node:child_process'
import { assertDatabaseTarget } from '../../src/db/target.ts'

const args = process.argv.slice(2)
const isMigrateDev = args[0] === 'migrate' && args[1] === 'dev'

try {
  const target = assertDatabaseTarget(process.env.DATABASE_URL)
  if (isMigrateDev && !target.isLocal) {
    throw new Error(
      `"prisma migrate dev" may reset the database and only runs against a local one.\n` +
        `Target was ${target.redacted}. Use "npm run db:deploy" for a deployed database.`,
    )
  }
  process.stdout.write(`prisma ${args.join(' ')}  →  ${target.redacted}\n`)

  const child = spawn('npx', ['prisma', ...args], { stdio: 'inherit' })
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
} catch (error) {
  process.stderr.write(`\n${(error as Error).message}\n\n`)
  process.exitCode = 1
}
