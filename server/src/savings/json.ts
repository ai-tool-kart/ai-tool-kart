/*
 * JsonWorkSavingsRepository — the V1 adapter.
 *
 * THE ONLY MODULE IN THE SERVER THAT KNOWS workSavings.json EXISTS.
 * `grep -rn "workSavings.json" src --exclude-dir=savings` must stay empty, and
 * tests/boundary.test.ts asserts it — the same guard the catalogue and the
 * stories have, because a boundary defended only by comments is one that has
 * already been crossed.
 *
 * Loads the file once at construction, validates every record, and sorts by
 * editorial `order`. Invalid data throws before the server can listen.
 *
 * The methods are async because the PORT is async, not because anything here
 * awaits. Moving these into a CMS or a table changes what happens inside them
 * and nothing about their signatures.
 *
 * No pagination, for the same reason stories/json.ts has none: the set is
 * written by hand, the selector shows all of it, and it is measured in dozens.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configError } from '../domain/errors.ts'
import type { WorkSavingsEstimate } from '../domain/types.ts'
import type { Logger } from '../utils/logger.ts'
import type { WorkSavingsRepository, WorkSavingsQuery } from './repository.ts'
import { parseWorkSavings } from './schema.ts'

const DATA_FILE = 'workSavings.json'

/** Resolved relative to this module so it works from src/ and from dist/. */
function defaultDataPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'data', DATA_FILE)
}

export interface JsonWorkSavingsRepositoryOptions {
  logger?: Logger
  /**
   * Test seam. Supplying records skips the file read entirely, so route tests
   * run against a small fixture rather than against the real seed content.
   */
  records?: unknown
  /** Override the file location. Production never sets this. */
  path?: string
}

export function createJsonWorkSavingsRepository(
  options: JsonWorkSavingsRepositoryOptions = {},
): WorkSavingsRepository {
  const { logger, records, path } = options
  const origin = records !== undefined ? 'in-memory records' : (path ?? defaultDataPath())
  const raw = records !== undefined ? records : readSavingsFile(origin)

  // Sorted once at construction: the order is editorial and fixed, and `order`
  // is unique (the schema enforces it), so the selector never reshuffles.
  const estimates = parseWorkSavings(raw, { origin }).sort((a, b) => a.order - b.order)

  logger?.info('Work-savings estimates loaded', { driver: 'json', records: estimates.length })

  return {
    id: 'json',

    async list(query: WorkSavingsQuery = {}) {
      const { limit } = query
      // A copy, so a caller cannot sort or splice the shared array underneath
      // the next request.
      return limit === undefined ? [...estimates] : estimates.slice(0, Math.max(limit, 0))
    },

    async size() {
      return estimates.length
    },
  }
}

function readSavingsFile(file: string): unknown {
  let contents: string
  try {
    contents = readFileSync(file, 'utf8')
  } catch (error) {
    throw configError(
      `Could not read the work-savings estimates at ${file}.\n` +
        `  ${(error as Error).message}\n` +
        '  The seed content ships with the server; a missing file means the ' +
        'build did not copy src/savings/data/.',
      { origin: file },
    )
  }

  try {
    return JSON.parse(contents) as unknown
  } catch (error) {
    throw configError(
      `The work-savings estimates at ${file} are not valid JSON.\n  ${(error as Error).message}`,
      { origin: file },
    )
  }
}
