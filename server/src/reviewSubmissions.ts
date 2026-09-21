/*
 * npm run review — approve or reject pending Submit intake submissions, one
 * at a time, into the live catalogue.
 *
 *   npm run review                interactive
 *   npm run review -- --dry-run   prints what would be written, writes nothing
 *   npm run review -- --force     runs even though the configured port looks bound
 *
 * Refuses to run against a server that appears to be up: this script writes
 * the submissions store and, via the catalogue's create(), the catalogue
 * file, and neither write is serialized against a SEPARATE process — see
 * catalogue/json.ts's header comment on create() for why. The check is a
 * best-effort probe (bind the server's own configured port; EADDRINUSE means
 * something is listening there), not a guarantee — --force exists for a
 * deployment where "the port is bound" doesn't mean "the server is up", not
 * for skipping this out of impatience.
 */

import { createServer } from 'node:net'
import { createInterface } from 'node:readline'
import { loadEnv } from './config/env.ts'
import { createContainer } from './container.ts'
import { runReview } from './review/cli.ts'
import { createAsker } from './review/prompt.ts'
import { createLogger } from './utils/logger.ts'

function portIsBound(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.code === 'EADDRINUSE')
    })
    probe.once('listening', () => {
      probe.close(() => resolve(false))
    })
    probe.listen(port, host)
  })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')

  let loaded
  try {
    loaded = loadEnv()
  } catch (error) {
    process.stderr.write(`\nConfiguration error:\n${(error as Error).message}\n\n`)
    process.exitCode = 1
    return
  }

  const { env, warnings } = loaded
  const logger = createLogger({ level: env.log.level, format: env.log.format })
  for (const warning of warnings) logger.warn(warning)

  const bound = await portIsBound(env.http.host, env.http.port)
  if (bound && !force) {
    process.stderr.write(
      `\nThe server appears to be running (${env.http.host}:${env.http.port} is already bound).\n` +
        'Stop it before running the review script — concurrent writes to the same files can lose data.\n' +
        'Re-run with --force only if you are certain nothing else is writing them.\n\n',
    )
    process.exitCode = 1
    return
  }
  if (bound && force) {
    logger.warn('Port is bound but --force was given — running anyway', {
      host: env.http.host,
      port: env.http.port,
    })
  }

  const container = createContainer({ env, logger })
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
  const ask = createAsker(rl)

  try {
    await runReview(container, { dryRun }, ask)
  } finally {
    rl.close()
  }
}

main()
