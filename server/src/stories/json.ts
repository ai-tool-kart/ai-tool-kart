/*
 * JsonUsageStoryRepository — the V1 adapter.
 *
 * THE ONLY MODULE IN THE SERVER THAT KNOWS stories.json EXISTS.
 * `grep -rn "stories.json" src --exclude-dir=stories` must stay empty, and
 * tests/boundary.test.ts asserts it — the same guard the catalogue has, because
 * a boundary defended only by comments is one that has already been crossed.
 *
 * Loads the file once at construction, validates every record, and sorts by
 * editorial `order`. Invalid data throws before the server can listen.
 *
 * The methods are async because the PORT is async, not because anything here
 * awaits. Moving these into a CMS or a table changes what happens inside them
 * and nothing about their signatures.
 *
 * ── Why there is no pagination ───────────────────────────────────────────────
 *
 * The catalogue adapter pages because a catalogue grows without bound. A story
 * set does not: it is written by hand, the rail shows all of it at once, and it
 * is measured in dozens. `limit` exists so a caller can ask for fewer; a cursor
 * would be machinery for a page that will never be turned.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configError } from '../domain/errors.ts'
import type { UsageStory } from '../domain/types.ts'
import type { Logger } from '../utils/logger.ts'
import type { UsageStoryRepository, UsageStoryQuery } from './repository.ts'
import { parseStories } from './schema.ts'

const DATA_FILE = 'stories.json'

/** Resolved relative to this module so it works from src/ and from dist/. */
function defaultDataPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'data', DATA_FILE)
}

export interface JsonUsageStoryRepositoryOptions {
  logger?: Logger
  /**
   * Test seam. Supplying records skips the file read entirely, so route tests
   * run against a small fixture rather than against the real seed content.
   */
  records?: unknown
  /** Override the file location. Production never sets this. */
  path?: string
}

export function createJsonUsageStoryRepository(
  options: JsonUsageStoryRepositoryOptions = {},
): UsageStoryRepository {
  const { logger, records, path } = options
  const origin = records !== undefined ? 'in-memory records' : (path ?? defaultDataPath())
  const raw = records !== undefined ? records : readStoriesFile(origin)

  // Sorted once at construction: the order is editorial and fixed, so paying for
  // it per request would be paying for a constant. `order` is unique (the schema
  // enforces it), so the sort is total and the rail never reshuffles.
  const stories = parseStories(raw, { origin }).sort((a, b) => a.order - b.order)

  logger?.info('Usage stories loaded', { driver: 'json', records: stories.length })

  return {
    id: 'json',

    async list(query: UsageStoryQuery = {}) {
      const { limit } = query
      // A copy, so a caller cannot sort or splice the shared array underneath
      // the next request.
      return limit === undefined ? [...stories] : stories.slice(0, Math.max(limit, 0))
    },

    async size() {
      return stories.length
    },
  }
}

function readStoriesFile(file: string): unknown {
  let contents: string
  try {
    contents = readFileSync(file, 'utf8')
  } catch (error) {
    throw configError(
      `Could not read the usage stories at ${file}.\n` +
        `  ${(error as Error).message}\n` +
        '  The seed content ships with the server; a missing file means the ' +
        'build did not copy src/stories/data/.',
      { origin: file },
    )
  }

  try {
    return JSON.parse(contents) as unknown
  } catch (error) {
    throw configError(
      `The usage stories at ${file} are not valid JSON.\n  ${(error as Error).message}`,
      { origin: file },
    )
  }
}
