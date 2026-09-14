/*
 * CLI entry point.
 *
 * One invocation runs one pipeline cycle and exits (NEWS_AGENT.md §22). Exit
 * code is 0 for a completed or skipped run — including one where every story was
 * rejected, which is a normal outcome — and 1 only when the run itself failed.
 *
 *   npm run agent
 *   npm run agent -- --dry-run
 *   npm run agent -- --source=openai-news --limit=1
 *   npm run agent -- --sources          list the registry
 *   npm run agent -- --inspect-db       recent runs and pipeline state
 *   npm run agent -- --llm-check        one structured-output call to the provider
 *   npm run taxonomy:check              verify configured WP categories exist
 *   npm run taxonomy:bootstrap          create missing configured categories
 */

import { parseArgs } from 'node:util'
import { describeEnv, loadEnv } from './config/env.ts'
import { isAgentError } from './domain/errors.ts'
import { checkProvider, formatProviderCheck } from './llm/check.ts'
import { executePipeline } from './pipeline/run.ts'
import { formatDuration, formatRunSummary } from './pipeline/summary.ts'
import { SOURCES } from './sources/registry.ts'
import { openDatabase } from './storage/db.ts'
import { createRepositories } from './storage/repositories.ts'
import { createWordPressClient } from './wordpress/client.ts'
import {
  bootstrapCategories,
  checkTaxonomy,
  formatTaxonomyReport,
  taxonomyIsReady,
} from './wordpress/bootstrap.ts'
import { createLogger, errorFields, type Logger } from './utils/logger.ts'

const USAGE = `
AI Tool Kart — News Agent

Usage: npm run agent -- [options]

Options:
  --dry-run           Run the full pipeline but never write to WordPress.
  --source=<id>       Ingest a single source by id.
  --limit=<n>         Cap articles generated this run.
  --sources           List the configured source registry and exit.
  --inspect-db        Print recent runs and stored state, then exit.
  --llm-check         Validate the LLM provider with one tiny structured-output
                      call. No feeds, no database writes, no WordPress.
  --taxonomy-check    Verify the configured WordPress categories exist. Read-only.
  --taxonomy-bootstrap
                      Create the configured categories that are missing.
                      Only allowlisted editorial categories; never tags, never
                      a name from article output. Needs manage_categories.
  --log-format=<fmt>  json | pretty (overrides AGENT_LOG_FORMAT).
  --verbose           Shorthand for debug-level logging.
  --help              Show this message.
`.trim()

function main(): void {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      source: { type: 'string' },
      limit: { type: 'string' },
      sources: { type: 'boolean', default: false },
      'inspect-db': { type: 'boolean', default: false },
      'llm-check': { type: 'boolean', default: false },
      'taxonomy-check': { type: 'boolean', default: false },
      'taxonomy-bootstrap': { type: 'boolean', default: false },
      'log-format': { type: 'string' },
      verbose: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.help) {
    process.stdout.write(`${USAGE}\n`)
    return
  }

  if (values.sources) {
    printSources()
    return
  }

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

  const logger = createLogger({
    level: values.verbose ? 'debug' : env.log.level,
    format: (values['log-format'] as 'json' | 'pretty' | undefined) ?? env.log.format,
  })

  for (const warning of warnings) logger.warn(warning)

  /*
   * Runs before the database is opened: the provider check is deliberately
   * side-effect free, so it must not create or lock a SQLite file either.
   */
  if (values['llm-check']) {
    logger.info('Checking LLM provider', describeEnv(env))
    checkProvider({ env, logger })
      .then((result) => {
        logger.plain(formatProviderCheck(result))
        logger.info('LLM provider check passed', {
          provider: result.provider,
          model: result.modelUsed,
          totalTokens: result.usage.inputTokens + result.usage.outputTokens,
        })
      })
      .catch((error: unknown) => {
        logger.error('LLM provider check failed', errorFields(error))
        if (isAgentError(error) && error.code === 'CONFIG') {
          process.stderr.write(`\n${error.message}\n\n`)
        }
        process.exitCode = 1
      })
    return
  }

  const db = openDatabase({ path: env.dbPath })
  const repos = createRepositories(db)

  if (values['inspect-db']) {
    inspectDatabase(repos, logger)
    repos.close()
    return
  }

  if (values['taxonomy-check'] || values['taxonomy-bootstrap']) {
    const bootstrap = values['taxonomy-bootstrap'] === true
    repos.close()

    if (!env.wordpress) {
      process.stderr.write(
        '\nWordPress is not configured. Set WORDPRESS_API_URL, WORDPRESS_USERNAME and ' +
          'WORDPRESS_APP_PASSWORD before running a taxonomy command.\n\n',
      )
      process.exitCode = 1
      return
    }

    const client = createWordPressClient({
      credentials: env.wordpress,
      logger,
      timeoutMs: env.http.timeoutMs,
      userAgent: env.http.userAgent,
    })

    const task = bootstrap
      ? bootstrapCategories({ client, logger })
      : checkTaxonomy({ client, logger })

    task
      .then((report) => {
        logger.plain(formatTaxonomyReport(report, bootstrap ? 'bootstrap' : 'check'))
        // Non-zero when the pipeline would defer on taxonomy, so CI and setup
        // scripts can gate on it.
        process.exitCode = taxonomyIsReady(report) ? 0 : 1
      })
      .catch((error: unknown) => {
        logger.error('Taxonomy command failed', errorFields(error))
        process.exitCode = 1
      })
    return
  }

  const dryRun = values['dry-run'] === true
  const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    process.stderr.write('--limit must be a positive integer\n')
    process.exitCode = 1
    repos.close()
    return
  }

  logger.info('Starting news agent', {
    ...describeEnv(env),
    dryRun,
    ...(values.source ? { source: values.source } : {}),
    ...(limit !== undefined ? { limit } : {}),
  })

  if (dryRun) logger.info('DRY RUN — no WordPress posts will be created')
  if (!env.wordpress && !dryRun) {
    logger.warn(
      'WordPress is not configured; approved drafts will be stored locally and published on a later run',
    )
  }

  /*
   * The run lock lives in the database and is finalised in the pipeline's own
   * error path, so an interrupted process is recovered by the stale-lock check
   * on the next run rather than by trying to clean up during a signal handler.
   */
  let shuttingDown = false
  const onSignal = (signal: string) => {
    if (shuttingDown) process.exit(130)
    shuttingDown = true
    logger.warn(`Received ${signal}; finishing the current step then exiting`, {
      note: 'The run lock will be released by the stale-lock check on the next run.',
    })
    process.exitCode = 130
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))

  executePipeline({
    env,
    repos,
    logger,
    dryRun,
    ...(values.source ? { sourceId: values.source } : {}),
    ...(limit !== undefined ? { limit } : {}),
  })
    .then(({ run, exitCode }) => {
      logger.plain(formatRunSummary(run))
      logger.info('Run finished', { status: run.status, duration: formatDuration(run) })
      if (run.errors.length > 0) {
        for (const error of run.errors.slice(0, 10)) {
          logger.warn('Run error', { step: error.step, code: error.code, message: error.message })
        }
      }
      process.exitCode = exitCode
    })
    .catch((error: unknown) => {
      logger.error('Unhandled pipeline failure', errorFields(error))
      if (isAgentError(error) && error.code === 'CONFIG') {
        process.stderr.write(`\n${error.message}\n\n`)
      }
      process.exitCode = 1
    })
    .finally(() => {
      repos.close()
    })
}

function printSources(): void {
  const lines: string[] = ['', 'Configured sources', '']
  for (const source of SOURCES) {
    const state = source.enabled ? 'enabled ' : 'disabled'
    lines.push(`  [${state}] tier ${source.trustTier}  ${source.id.padEnd(24)} ${source.url}`)
    if (source.note) lines.push(`             note: ${source.note.replace(/\s+/g, ' ')}`)
  }
  const enabled = SOURCES.filter((source) => source.enabled).length
  lines.push('', `  ${enabled} enabled, ${SOURCES.length - enabled} disabled`, '')
  process.stdout.write(`${lines.join('\n')}\n`)
}

function inspectDatabase(repos: ReturnType<typeof createRepositories>, logger: Logger): void {
  const runs = repos.runs.listRecent(10)
  logger.plain('')
  logger.plain('Recent runs')
  if (runs.length === 0) logger.plain('  (none)')
  for (const run of runs) {
    logger.plain(`  ${formatRunSummary(run)}`)
  }

  const pending = repos.articles.listAwaitingPublication()
  logger.plain('')
  logger.plain(`Approved drafts awaiting WordPress publication: ${pending.length}`)
  for (const article of pending.slice(0, 10)) {
    logger.plain(`  ${article.slug}  (${article.wordCount} words, confidence ${article.confidence})`)
  }

  const published = repos.articles.listPublishedTitles(10)
  logger.plain('')
  logger.plain(`Articles sent to WordPress: ${published.length}`)
  for (const entry of published) logger.plain(`  ${entry.title}`)
  logger.plain('')
}

main()
