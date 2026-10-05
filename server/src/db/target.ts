/*
 * Which database is this process about to touch, and is it allowed to?
 *
 * Every script that writes to Postgres (migrations aside, which Prisma runs
 * itself) calls assertDatabaseTarget() before connecting. The default answer
 * for anything that is not this machine is NO:
 *
 *   localhost / 127.0.0.1 / ::1 / a unix socket   allowed
 *   any other host                                refused, unless
 *                                                 DATABASE_ALLOW_REMOTE_HOST
 *                                                 names that exact host
 *
 * Naming the host — rather than a boolean "yes, remote is fine" — is the
 * point: a DATABASE_URL copied from the wrong Railway environment fails
 * loudly instead of silently importing into production.
 *
 * redactDatabaseUrl() is what every log line and console message prints.
 * A password never leaves this module.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', ''])

export interface DatabaseTarget {
  /** The URL with any password replaced by "***". Safe to print. */
  redacted: string
  host: string
  database: string
  isLocal: boolean
}

export function describeDatabaseUrl(rawUrl: string): DatabaseTarget {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('DATABASE_URL is not a valid URL (expected postgresql://user@host:port/database).')
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`DATABASE_URL must use postgresql://, got "${url.protocol}".`)
  }

  // A `host=/path/to/socket` query parameter means a unix socket, which is
  // local by definition however the authority part reads.
  const socketHost = url.searchParams.get('host')
  const isSocket = socketHost !== null && socketHost.startsWith('/')
  const host = isSocket ? socketHost : url.hostname

  const redactedUrl = new URL(url.href)
  if (redactedUrl.password) redactedUrl.password = '***'
  for (const key of ['password', 'sslpassword']) {
    if (redactedUrl.searchParams.has(key)) redactedUrl.searchParams.set(key, '***')
  }

  return {
    redacted: redactedUrl.href,
    host,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    isLocal: isSocket || LOCAL_HOSTS.has(url.hostname),
  }
}

/** Returns the described target when allowed; throws a fix-it message when refused. */
export function assertDatabaseTarget(
  rawUrl: string | undefined,
  allowRemoteHost: string | undefined = process.env.DATABASE_ALLOW_REMOTE_HOST,
): DatabaseTarget {
  if (!rawUrl || rawUrl.trim() === '') {
    throw new Error('DATABASE_URL is not set. See server/.env.example.')
  }
  const target = describeDatabaseUrl(rawUrl)
  if (target.isLocal) return target

  if (allowRemoteHost && allowRemoteHost.trim() === target.host) return target

  throw new Error(
    `Refusing to use the non-local database at host "${target.host}" (${target.redacted}).\n` +
      'If this is really the database you mean, re-run with\n' +
      `  DATABASE_ALLOW_REMOTE_HOST=${target.host}\n` +
      'set for this one command. Never put it in a .env file.',
  )
}
