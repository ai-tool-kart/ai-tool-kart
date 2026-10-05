/*
 * pg_dump wrapper shared by `npm run db:backup` and the importer's
 * pre-import snapshot.
 *
 * Custom format (-Fc): compressed, and restorable table-by-table with
 * pg_restore. The password, if the URL has one, is passed through
 * PGPASSWORD rather than argv so it never appears in `ps` output.
 *
 * pg_dump's major version must be >= the server's. Homebrew's
 * postgresql@17 client covers the local database; for Railway, check the
 * server version first (SELECT version()).
 */

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { DatabaseTarget } from '../../src/db/target.ts'

export const BACKUP_DIR = join(process.cwd(), 'backups')

export function timestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

export async function pgDump(rawUrl: string, target: DatabaseTarget, label: string): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true })
  const file = join(BACKUP_DIR, `${label}-${target.database}-${timestamp()}.dump`)

  const url = new URL(rawUrl)
  const password = decodeURIComponent(url.password)
  url.password = ''

  await new Promise<void>((resolve, reject) => {
    const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--file', file, '--dbname', url.href], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) },
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'ENOENT'
          ? new Error('pg_dump is not on PATH. Locally: export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH".')
          : error,
      )
    })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited with code ${code}.`))))
  })

  return file
}
