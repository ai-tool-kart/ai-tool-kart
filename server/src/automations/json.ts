/*
 * JsonAutomationRepository — the V1 adapter.
 *
 * THE ONLY MODULE IN THE SERVER THAT KNOWS THE AUTOMATIONS ARE JSON FILES.
 * Nothing outside automations/ names automations/data, and nothing inside it
 * but this file touches the filesystem — tests/boundary.test.ts asserts both,
 * the same guards the catalogue and the stories have.
 *
 * Reads every per-niche file in data/ once at construction (one file per
 * niche, written by server/scripts/importAutomations.ts), concatenates them,
 * validates the lot through parseAutomations, and indexes. A bad record — or
 * a file that is not a JSON array — throws before the server can listen,
 * collecting every problem first, exactly as the catalogue does.
 *
 * The methods are async because the PORT is async, not because anything here
 * awaits.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configError } from '../domain/errors.ts'
import type { Logger } from '../utils/logger.ts'
import type { AutomationQuery, AutomationRepository } from './repository.ts'
import { parseAutomations } from './schema.ts'
import type { Automation } from './types.ts'

const DATA_DIR = 'data'

/** Resolved relative to this module so it works from src/ and from dist/. */
function defaultDataDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), DATA_DIR)
}

export interface JsonAutomationRepositoryOptions {
  logger?: Logger
  /**
   * Test seam. Supplying records skips the directory read entirely, so tests
   * run against a small fixture rather than the real imported content.
   */
  records?: unknown
  /** Override the directory. Production never sets this. */
  dir?: string
}

/** Niche and slug together — slugs are unique within a niche only. */
const slugKey = (niche: string, slug: string): string => `${niche}\u0000${slug}`

export function createJsonAutomations(
  options: JsonAutomationRepositoryOptions = {},
): AutomationRepository {
  const { logger, records, dir } = options
  const origin = records !== undefined ? 'in-memory records' : (dir ?? defaultDataDir())
  const raw = records !== undefined ? records : readDataDir(origin)

  const automations = parseAutomations(raw, { origin })

  // Built once: the set is fixed for the life of the process.
  const bySlug = new Map<string, Automation>()
  const activeByNiche = new Map<string, Automation[]>()
  const active: Automation[] = []
  for (const automation of automations) {
    bySlug.set(slugKey(automation.niche, automation.slug), automation)
    if (automation.status !== 'active') continue
    active.push(automation)
    const list = activeByNiche.get(automation.niche) ?? []
    list.push(automation)
    activeByNiche.set(automation.niche, list)
  }

  logger?.info('Automations loaded', {
    driver: 'json',
    records: automations.length,
    active: active.length,
    niches: activeByNiche.size,
  })

  return {
    id: 'json',

    async findBySlug(niche, slug) {
      return bySlug.get(slugKey(niche, slug))
    },

    async listByNiche(niche) {
      // A copy, so a caller cannot reorder the shared array.
      return [...(activeByNiche.get(niche) ?? [])]
    },

    async list(query: AutomationQuery = {}) {
      const { kind, niche, limit } = query
      let result = niche === undefined ? active : (activeByNiche.get(niche) ?? [])
      // 'mcp' narrows; 'workflow' is every automation not marked 'mcp' — today
      // that is all of them. Unlike ToolQuery.kind, an automation has exactly
      // one kind, so filtering on either value is well defined.
      if (kind !== undefined) result = result.filter((automation) => automation.kind === kind)
      return limit === undefined ? [...result] : result.slice(0, Math.max(limit, 0))
    },

    async findManyByIds(ids) {
      const wanted = new Set(ids)
      return automations.filter((automation) => wanted.has(automation.id))
    },

    async size() {
      return active.length
    },
  }
}

/**
 * Every `.json` file in the directory, in name order, concatenated. Each file
 * must be an array; which file broke is named, since parseAutomations only
 * sees the combined list.
 */
function readDataDir(dir: string): unknown[] {
  let names: string[]
  try {
    names = readdirSync(dir)
      .filter((name) => extname(name) === '.json')
      .sort()
  } catch (error) {
    throw configError(
      `Could not read the automations directory at ${dir}.\n` +
        `  ${(error as Error).message}\n` +
        '  The data ships with the server; a missing directory means the build ' +
        'did not copy src/automations/data/.',
      { origin: dir },
    )
  }

  const records: unknown[] = []
  for (const name of names) {
    const file = join(dir, name)
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    } catch (error) {
      throw configError(
        `The automations file ${file} could not be read as JSON.\n  ${(error as Error).message}`,
        { origin: file },
      )
    }
    if (!Array.isArray(parsed)) {
      throw configError(`The automations file ${file} must be a JSON array of records.`, {
        origin: file,
      })
    }
    records.push(...parsed)
  }
  return records
}
