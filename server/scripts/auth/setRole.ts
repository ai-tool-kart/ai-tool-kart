/*
 * npm run auth:set-role -- --email <address> --role <USER|ADMIN|SUPER_ADMIN>
 *
 * Bootstrap only: the HTTP role endpoint needs an existing SUPER_ADMIN, so
 * the first one has to be made from a shell with database access. The
 * account must already exist (register through the API first).
 *
 * Same guard as the db scripts: refuses a non-local database unless
 * DATABASE_ALLOW_REMOTE_HOST names its host. Lowering a role revokes the
 * user's sessions, matching the HTTP endpoint.
 */

import { parseArgs } from 'node:util'
import { derivedRole, ROLE_RANK } from '../../src/auth/roles.ts'
import { normalizeEmail } from '../../src/auth/schema.ts'
import { createDatabase } from '../../src/db/client.ts'
import { assertDatabaseTarget } from '../../src/db/target.ts'
import type { UserRole } from '../../src/generated/prisma/client.ts'

const ASSIGNABLE = ['USER', 'ADMIN', 'SUPER_ADMIN'] as const

try {
  const { values } = parseArgs({ options: { email: { type: 'string' }, role: { type: 'string' } } })
  if (!values.email || !values.role) throw new Error('Usage: npm run auth:set-role -- --email <address> --role <USER|ADMIN|SUPER_ADMIN>')
  if (!(ASSIGNABLE as readonly string[]).includes(values.role)) {
    throw new Error(`--role must be one of ${ASSIGNABLE.join(', ')} (TOOL_OWNER follows tool ownership).`)
  }

  const target = assertDatabaseTarget(process.env.DATABASE_URL)
  process.stdout.write(`Database: ${target.redacted}\n`)
  const db = createDatabase(process.env.DATABASE_URL as string)
  try {
    const email = normalizeEmail(values.email)
    const user = await db.user.findUnique({ where: { email } })
    if (!user) throw new Error(`No account with email ${email}. Register it through the API first.`)

    const requested = values.role as UserRole
    const role = requested === 'USER' ? derivedRole('USER', await db.toolOwner.count({ where: { userId: user.id } })) : requested
    await db.user.update({ where: { id: user.id }, data: { role } })
    if (ROLE_RANK[role] < ROLE_RANK[user.role]) {
      await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    }
    process.stdout.write(`${email}: ${user.role} → ${role}\n`)
  } finally {
    await db.$disconnect()
  }
} catch (error) {
  process.stderr.write(`\n${(error as Error).message}\n\n`)
  process.exitCode = 1
}
