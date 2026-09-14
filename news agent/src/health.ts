/*
 * Preflight health check — `npm run agent:health`.
 *
 * Answers "would a scheduled run work right now?" without doing any of a run's
 * work. Every check is READ-ONLY: no WordPress writes, no ingestion, no story
 * generation, and no LLM tokens spent.
 *
 * The LLM check is deliberately configuration-only. A live structured-output
 * probe already exists as `--llm-check` and costs real money; a health check
 * that a scheduler might run every few minutes must not. So this verifies the
 * provider resolves and a key is present, and points at --llm-check for proof of
 * life.
 *
 * Exit code is what a monitor keys on: 0 healthy, 1 when something would stop a
 * run from producing drafts.
 */

import { describeEnv, type AgentEnv } from './config/env.ts'
import { EDITORIAL_CATEGORIES } from './config/editorial.ts'
import { createProvider } from './llm/factory.ts'
import { openDatabase } from './storage/db.ts'
import { createRepositories } from './storage/repositories.ts'
import { createWordPressClient } from './wordpress/client.ts'
import { checkTaxonomy, taxonomyIsReady } from './wordpress/bootstrap.ts'
import { errorMessage } from './domain/errors.ts'
import type { Logger } from './utils/logger.ts'

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface HealthCheck {
  name: string
  status: CheckStatus
  detail: string
}

export interface HealthReport {
  checks: HealthCheck[]
  healthy: boolean
}

export async function runHealthCheck(options: {
  env: AgentEnv
  logger: Logger
}): Promise<HealthReport> {
  const { env, logger } = options
  const checks: HealthCheck[] = []

  /* ── configuration ──────────────────────────────────────────────────────── */

  checks.push({
    name: 'config',
    status: 'ok',
    detail: `provider=${env.llm.provider} autoPublish=false enabled=${env.enabled}`,
  })

  if (!env.enabled) {
    checks.push({
      name: 'kill-switch',
      status: 'warn',
      detail: 'AGENT_ENABLED=false — scheduled runs exit immediately without doing work',
    })
  }

  /* ── LLM provider: configuration only, zero tokens ──────────────────────── */

  try {
    const provider = createProvider({ env })
    const needsKey = provider.id !== 'mock'
    checks.push({
      name: 'llm-provider',
      status: needsKey && !env.llm.apiKey ? 'fail' : 'ok',
      detail:
        `${provider.id} fast=${provider.modelFor('fast')} strong=${provider.modelFor('strong')} ` +
        `key=${env.llm.apiKey ? 'present' : 'absent'} (no tokens spent; use --llm-check to prove a live call)`,
    })
  } catch (error) {
    checks.push({ name: 'llm-provider', status: 'fail', detail: errorMessage(error) })
  }

  /* ── database and run lock ──────────────────────────────────────────────── */

  let repos: ReturnType<typeof createRepositories> | undefined
  try {
    repos = createRepositories(openDatabase({ path: env.dbPath }))
    const active = repos.runs.listRecent(5).filter((run) => run.status === 'running')
    checks.push({ name: 'database', status: 'ok', detail: `reachable at ${env.dbPath}` })
    checks.push({
      name: 'run-lock',
      status: active.length > 0 ? 'warn' : 'ok',
      detail:
        active.length > 0
          ? `${active.length} run(s) marked running (${active.map((r) => r.id).join(', ')}); a stale lock is reclaimed after ${env.runLockStaleMinutes} minutes`
          : 'free',
    })
    const pending = repos.articles.listAwaitingPublication()
    checks.push({
      name: 'pending-drafts',
      status: 'ok',
      detail: `${pending.length} approved article(s) awaiting WordPress publication`,
    })
  } catch (error) {
    checks.push({ name: 'database', status: 'fail', detail: errorMessage(error) })
  } finally {
    repos?.close()
  }

  /* ── WordPress: auth and taxonomy, both read-only ───────────────────────── */

  if (!env.wordpress) {
    checks.push({
      name: 'wordpress',
      status: 'warn',
      detail: 'not configured — approved drafts would be retained locally for a later run',
    })
  } else {
    const client = createWordPressClient({
      credentials: env.wordpress,
      logger,
      timeoutMs: env.http.timeoutMs,
      userAgent: env.http.userAgent,
    })

    const connection = await client.checkConnection()
    checks.push({
      name: 'wordpress-auth',
      status: connection.ok ? 'ok' : 'fail',
      detail: connection.ok ? `authenticated as ${env.wordpress.username}` : connection.reason,
    })

    if (connection.ok) {
      try {
        const report = await checkTaxonomy({ client, logger })
        const ready = taxonomyIsReady(report)
        checks.push({
          name: 'taxonomy',
          status: ready ? 'ok' : 'fail',
          detail: `${report.present}/${EDITORIAL_CATEGORIES.length} configured categories exist${
            ready ? '' : ` — missing: ${report.missing.join(', ')}`
          }`,
        })
      } catch (error) {
        checks.push({ name: 'taxonomy', status: 'fail', detail: errorMessage(error) })
      }
    }
  }

  return { checks, healthy: checks.every((check) => check.status !== 'fail') }
}

export function formatHealthReport(report: HealthReport, env: AgentEnv): string {
  const symbol: Record<CheckStatus, string> = { ok: '[ok  ]', warn: '[warn]', fail: '[FAIL]' }
  const lines = ['', 'Agent health check (read-only)', '']
  for (const check of report.checks) {
    lines.push(`  ${symbol[check.status]} ${check.name.padEnd(18)} ${check.detail}`)
  }
  lines.push('')
  lines.push(`  ${report.healthy ? 'Healthy — a scheduled run can proceed.' : 'UNHEALTHY — a scheduled run would not produce drafts.'}`)
  lines.push('')
  lines.push(`  caps: candidates=${env.limits.maxCandidatesPerRun} verified=${env.limits.maxStoriesVerifiedPerRun} articles=${env.limits.maxArticlesPerRun} calls=${env.limits.maxLlmCallsPerRun} tokens=${env.limits.maxTokensPerRun}`)
  lines.push(`  publishing: drafts only (auto-publish is not implemented)`)
  lines.push('')
  return lines.join('\n')
}

/** Startup summary used by the run path too. Never includes a credential. */
export function describeStartup(env: AgentEnv): Record<string, unknown> {
  return describeEnv(env)
}
