/*
 * Taxonomy preflight and bootstrap (NEWS_AGENT.md §20).
 *
 * The editorial category set is fixed configuration, so making it exist in
 * WordPress is a deployment step, not something the pipeline should do while
 * publishing an article. This module is that step, split in two:
 *
 *   checkTaxonomy()       read-only. Authenticates, lists the configured
 *                         categories, reports which are missing. Writes nothing,
 *                         so it is safe to run against production at any time.
 *
 *   bootstrapCategories() creates ONLY categories on the configured allowlist.
 *                         It cannot be handed a name — it iterates
 *                         EDITORIAL_CATEGORIES — so no model output, CLI
 *                         argument or environment value can reach createTerm.
 *
 * Both are explicit operator actions invoked from the CLI, never called by the
 * pipeline. Term creation in the `category` taxonomy needs `manage_categories`
 * (see the capability note in taxonomy.ts), which the agent account should not
 * hold; bootstrap is therefore expected to be run with an administrator's
 * credentials, once, and the failure is reported plainly when it is not.
 */

import {
  CATEGORY_LABELS,
  EDITORIAL_CATEGORIES,
  type EditorialCategory,
} from '../config/editorial.ts'
import { AgentError, isAgentError } from '../domain/errors.ts'
import type { Logger } from '../utils/logger.ts'
import type { WordPressClient, WordPressTerm } from './client.ts'

export interface TaxonomyDeps {
  client: WordPressClient
  logger: Logger
}

export interface CategoryState {
  category: EditorialCategory
  label: string
  /** Present when the term already exists in WordPress. */
  termId?: number
  /** Set by bootstrap when this run created the term. */
  created?: boolean
  /** Set when the term is missing and could not be created. */
  error?: string
}

export interface TaxonomyReport {
  authenticated: boolean
  /** Reason authentication failed, when it did. */
  authError?: string
  categories: CategoryState[]
  present: number
  missing: EditorialCategory[]
  /** Only ever non-empty for bootstrap. */
  created: EditorialCategory[]
  failed: EditorialCategory[]
}

function emptyReport(): TaxonomyReport {
  return {
    authenticated: false,
    categories: [],
    present: 0,
    missing: [],
    created: [],
    failed: [],
  }
}

/**
 * Read-only verification that every configured category exists in WordPress.
 *
 * Performs no writes whatsoever — one authentication probe and one term lookup
 * per configured category.
 */
export async function checkTaxonomy(deps: TaxonomyDeps): Promise<TaxonomyReport> {
  const { client } = deps
  const log = deps.logger.child({ step: 'taxonomy-check' })
  const report = emptyReport()

  const connection = await client.checkConnection()
  if (!connection.ok) {
    report.authError = connection.reason
    log.error('WordPress authentication failed; cannot verify taxonomy', { reason: connection.reason })
    return report
  }
  report.authenticated = true

  for (const category of EDITORIAL_CATEGORIES) {
    const label = CATEGORY_LABELS[category]
    try {
      const term = await client.findTerm('categories', category)
      if (term) {
        report.categories.push({ category, label, termId: term.id })
        report.present += 1
      } else {
        report.categories.push({ category, label })
        report.missing.push(category)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      report.categories.push({ category, label, error: message })
      report.missing.push(category)
      log.warn('Category lookup failed', { category, err: message })
    }
  }

  return report
}

/**
 * Creates the configured categories that do not yet exist.
 *
 * The allowlist is the loop bound, not a filter applied to caller input: there
 * is no parameter through which an arbitrary category name could be introduced.
 */
export async function bootstrapCategories(deps: TaxonomyDeps): Promise<TaxonomyReport> {
  const { client } = deps
  const log = deps.logger.child({ step: 'taxonomy-bootstrap' })

  const report = await checkTaxonomy(deps)
  if (!report.authenticated) return report

  const missing = [...report.missing]
  report.missing = []

  for (const category of missing) {
    const label = CATEGORY_LABELS[category]
    const state = report.categories.find((entry) => entry.category === category)
    try {
      const term: WordPressTerm = await client.createTerm('categories', label, category)
      log.info('Created WordPress category', { category, label, termId: term.id })
      report.created.push(category)
      report.present += 1
      if (state) {
        state.termId = term.id
        state.created = true
        delete state.error
      }
    } catch (error) {
      const message =
        isAgentError(error) && error.code === 'WORDPRESS_AUTH'
          ? `${error.message} — creating a category requires the "manage_categories" capability, ` +
            `which the agent account deliberately does not hold. Run this command with an ` +
            `administrator's application password, or create the term in wp-admin.`
          : error instanceof Error
            ? error.message
            : String(error)

      log.error('Could not create WordPress category', { category, label, err: message })
      report.failed.push(category)
      report.missing.push(category)
      if (state) state.error = message
    }
  }

  return report
}

/** Human-readable rendering of a report, for the CLI. */
export function formatTaxonomyReport(report: TaxonomyReport, mode: 'check' | 'bootstrap'): string {
  const lines: string[] = ['']

  if (!report.authenticated) {
    lines.push('WordPress taxonomy: AUTHENTICATION FAILED', '')
    lines.push(`  ${report.authError ?? 'unknown reason'}`, '')
    return lines.join('\n')
  }

  lines.push(`WordPress taxonomy ${mode} — ${EDITORIAL_CATEGORIES.length} configured categories`, '')
  for (const entry of report.categories) {
    const mark = entry.termId ? (entry.created ? 'created' : 'ok     ') : 'MISSING'
    const id = entry.termId ? ` (id ${entry.termId})` : ''
    lines.push(`  [${mark}] ${entry.category.padEnd(17)} ${entry.label}${id}`)
    if (entry.error) lines.push(`             ${entry.error}`)
  }

  lines.push('')
  lines.push(`  present: ${report.present}/${EDITORIAL_CATEGORIES.length}`)
  if (report.created.length > 0) lines.push(`  created: ${report.created.join(', ')}`)
  if (report.missing.length > 0) {
    lines.push(`  missing: ${report.missing.join(', ')}`)
    lines.push('')
    lines.push(
      mode === 'check'
        ? '  Run "npm run taxonomy:bootstrap" with an account holding manage_categories,'
        : '  These could not be created. Create them in wp-admin, or re-run with',
    )
    lines.push(
      mode === 'check'
        ? '  or create these categories in wp-admin. Publishing defers for a missing category.'
        : "  an administrator's application password. Publishing defers for a missing category.",
    )
  } else {
    lines.push('  Every configured category exists. Publishing will not defer on taxonomy.')
  }

  lines.push('')
  return lines.join('\n')
}

/** True when the report means the pipeline would defer on taxonomy. */
export function taxonomyIsReady(report: TaxonomyReport): boolean {
  return report.authenticated && report.missing.length === 0
}

/** Re-exported so the CLI does not need to import the error module directly. */
export function isAuthFailure(error: unknown): boolean {
  return isAgentError(error) && error.code === 'WORDPRESS_AUTH'
}

export { AgentError }
