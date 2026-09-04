/*
 * Process entry point.
 *
 * Owns everything that touches the outside world: reading the environment,
 * creating the logger, opening the socket, and shutting down cleanly. The app
 * itself (app.ts) and the wiring (container.ts) know none of it.
 *
 *   npm run dev     watch mode, loads server/.env if present
 *   npm start       same without the watcher
 *
 * Exit code is 0 for a clean shutdown and 1 for a startup failure.
 */

import type { Server } from 'node:http'
import { createApp } from './app.ts'
import { describeEnv, loadEnv } from './config/env.ts'
import { API_BASE_PATH, HEALTH, HTTP } from './config/limits.ts'
import { createContainer } from './container.ts'
import { createLogger, errorFields, type Logger } from './utils/logger.ts'
import { SERVER_VERSION } from './utils/version.ts'

function main(): void {
  let loaded
  try {
    loaded = loadEnv()
  } catch (error) {
    // Config errors happen before a logger exists, so they are written directly.
    process.stderr.write(`\nConfiguration error:\n${(error as Error).message}\n\n`)
    process.exitCode = 1
    return
  }

  const { env, warnings } = loaded
  const logger = createLogger({ level: env.log.level, format: env.log.format })

  for (const warning of warnings) logger.warn(warning)

  const container = createContainer({ env, logger })
  const app = createApp(container)

  const server = app.listen(env.http.port, env.http.host, () => {
    logger.info('Server listening', {
      version: SERVER_VERSION,
      url: `http://${env.http.host}:${env.http.port}${API_BASE_PATH}${HEALTH.path}`,
      ...describeEnv(env),
    })
  })

  server.on('error', (error) => {
    logger.error('Server failed to start', errorFields(error))
    process.exitCode = 1
  })

  installShutdownHandlers(server, logger)
}

/**
 * Stops accepting connections, lets in-flight requests finish, then exits.
 *
 * The grace period is bounded: a hung request must not be able to block a
 * deploy indefinitely. `unref()` on the timer means a server that closes
 * promptly is not held open by the timeout itself.
 */
function installShutdownHandlers(server: Server, logger: Logger): void {
  let shuttingDown = false

  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('Shutting down', { signal })

    const forceExit = setTimeout(() => {
      logger.warn('Grace period elapsed with requests still open; exiting anyway', {
        graceMs: HTTP.shutdownGraceMs,
      })
      process.exit(0)
    }, HTTP.shutdownGraceMs)
    forceExit.unref()

    server.close((error) => {
      if (error) logger.error('Error while closing the server', errorFields(error))
      clearTimeout(forceExit)
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()
