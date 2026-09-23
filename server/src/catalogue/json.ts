/*
 * JsonToolCatalogue — the V1 adapter.
 *
 * THE ONLY MODULE IN THE SERVER THAT KNOWS A JSON FILE EXISTS.
 * `grep -rn "tools.json" src --exclude-dir=catalogue` must stay empty, and
 * tests/boundary.test.ts asserts exactly that (ASSISTANT_ARCHITECTURE_PLAN.md
 * §6.1).
 *
 * Loads data/tools.json once at construction, validates every record, and builds
 * the in-memory indexes retrieval leans on (byId, bySlug, byCategory, byStage,
 * byRole) plus byNormalizedUrl, which backs the Submit intake's catalogue-side
 * duplicate check (findByNormalizedUrl, repository.ts). Invalid data throws
 * before the server can listen — see schema.ts.
 *
 * `create()` is the one write: the review script's approve step
 * (review/approve.ts), and nothing else. Same atomic temp-file-then-rename
 * technique submissions/store.json.ts uses (writeCatalogueFile below), and
 * the same module-scope `writeChain` pattern to serialize concurrent writers
 * — but that only serializes writers WITHIN this process. It does nothing
 * for a second `node` process (the review script run against a live server)
 * racing this one; that is why reviewSubmissions.ts refuses to run against a
 * server that already has the port bound, rather than relying on this. Only
 * `create()` ever pushes into `tools` or mutates `indexes` after
 * construction — every other method treats both as read-only, which is what
 * makes them safe to read without a lock.
 *
 * The methods are async because the PORT is async, not because anything here
 * awaits. That asymmetry is the entire point of §6.2: PostgresToolCatalogue
 * changes what happens inside these methods and nothing about their signatures.
 *
 * ── Pagination ────────────────────────────────────────────────────────────────
 *
 * The cursor is an opaque base64 offset. Offsets are the honest choice for a
 * catalogue in the tens: they are stable because the sort is total (every
 * comparator falls through to `id`), and they translate directly to SQL
 * OFFSET. If the catalogue ever grows to where offset paging hurts, the cursor
 * is already opaque, so swapping it for a keyset cursor changes this file only.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configError, internalError } from '../domain/errors.ts'
import type { Tool } from '../domain/types.ts'
import type { Logger } from '../utils/logger.ts'
import { normalizeUrl } from '../utils/normalizeUrl.ts'
import type { ToolCatalogueRepository, ToolPage, ToolQuery } from './repository.ts'
import { parseCatalogue } from './schema.ts'
import {
  buildTaxonomy,
  DEFAULT_STATUS,
  type RoleName,
  type SortOption,
  type Taxonomy,
  type ToolCategoryName,
  type WorkflowStage,
} from './taxonomy.ts'

const DATA_FILE = 'tools.json'

/**
 * The single write queue for every catalogue this process creates — same
 * reasoning as submissions/store.json.ts's `writeChain`: two concurrent
 * writers racing the same read-modify-write cycle can silently drop one
 * record, and a shared chain costs nothing real at this scale. Only
 * `create()` (the review script's write) ever enqueues onto it.
 */
let writeChain: Promise<void> = Promise.resolve()

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task)
  writeChain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/** Resolved relative to this module so it works from src/ and from dist/. */
function defaultDataPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'data', DATA_FILE)
}

export interface JsonToolCatalogueOptions {
  logger?: Logger
  /**
   * Test seam. Supplying records skips the file read entirely, which is what
   * lets tests/catalogue.contract.ts run the reusable suite against a small
   * fixture rather than against the real seed data.
   */
  records?: unknown
  /** Override the file location. Production never sets this. */
  path?: string
}

interface Indexes {
  byId: Map<string, Tool>
  bySlug: Map<string, Tool>
  byCategory: Map<ToolCategoryName, Tool[]>
  byStage: Map<WorkflowStage, Tool[]>
  byRole: Map<RoleName, Tool[]>
  byNormalizedUrl: Map<string, Tool>
}

export function createJsonToolCatalogue(
  options: JsonToolCatalogueOptions = {},
): ToolCatalogueRepository {
  const { logger, records, path } = options
  const origin = records !== undefined ? 'in-memory records' : (path ?? defaultDataPath())
  const raw = records !== undefined ? records : readCatalogueFile(origin)
  // Where create() writes. Independent of `origin`: a catalogue built from
  // in-memory `records` (every fixture-backed test) has no real file behind
  // it, so — unlike `origin` above — this must NOT fall back to
  // defaultDataPath() in that case, or create() would silently overwrite the
  // real seed file the moment a fixture-only test called it.
  const filePath = records !== undefined ? path : (path ?? defaultDataPath())

  const tools = parseCatalogue(raw, { origin })
  const indexes = buildIndexes(tools)
  const taxonomy = buildTaxonomy()
  let activeCount = tools.filter((tool) => tool.status === 'active').length

  logger?.info('Catalogue loaded', {
    driver: 'json',
    records: tools.length,
    active: activeCount,
  })

  return {
    id: 'json',

    async findById(id) {
      return indexes.byId.get(id)
    },

    async findBySlug(slugValue) {
      return indexes.bySlug.get(slugValue)
    },

    async findManyByIds(ids) {
      const found: Tool[] = []
      const seen = new Set<string>()
      for (const id of ids) {
        if (seen.has(id)) continue
        seen.add(id)
        const tool = indexes.byId.get(id)
        if (tool) found.push(tool)
      }
      return found
    },

    async search(query) {
      return runSearch(tools, indexes, query)
    },

    async taxonomy() {
      return taxonomy
    },

    async size() {
      return activeCount
    },

    async findByNormalizedUrl(url) {
      return indexes.byNormalizedUrl.get(url)
    },

    async create(tool) {
      if (filePath === undefined) {
        throw internalError(
          'This catalogue has no real file to write to (built from in-memory records, no path given).',
        )
      }

      return enqueueWrite(async () => {
        // Revalidates the WHOLE catalogue, new record included, through the
        // identical function the loader runs at boot — same duplicate-id and
        // duplicate-slug checks, same field rules. A record that would fail
        // the server's next startup must fail HERE, not get written and fail
        // then. `tools` is already-parsed `Tool[]`, which `parseCatalogue`
        // accepts as readily as raw JSON — no need to keep the original file
        // text around just to re-validate it.
        const validated = parseCatalogue([...tools, tool], { origin: `${origin} (pending write)` })
        const created = validated[validated.length - 1] as Tool

        await writeCatalogueFile(filePath, validated)

        // Only after the write succeeds: a later call in this same process
        // (there is at most one per review-script run, but retrieval and
        // any other reader sharing this instance must see it too) finds the
        // tool without a restart.
        tools.push(created)
        indexOne(indexes, created)
        if (created.status === 'active') activeCount++

        return created
      })
    },
  }
}

async function writeCatalogueFile(filePath: string, tools: Tool[]): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(tempPath, JSON.stringify(tools, null, 2), 'utf8')
    await rename(tempPath, filePath)
  } catch (error) {
    throw internalError('Could not write the tool catalogue.', error)
  }
}

function readCatalogueFile(file: string): unknown {
  let contents: string
  try {
    contents = readFileSync(file, 'utf8')
  } catch (error) {
    throw configError(
      `Could not read the tool catalogue at ${file}.\n` +
        `  ${(error as Error).message}\n` +
        '  The seed catalogue ships with the server; a missing file means the ' +
        'build did not copy src/catalogue/data/.',
      { origin: file },
    )
  }

  try {
    return JSON.parse(contents) as unknown
  } catch (error) {
    throw configError(
      `The tool catalogue at ${file} is not valid JSON.\n  ${(error as Error).message}`,
      { origin: file },
    )
  }
}

function buildIndexes(tools: Tool[]): Indexes {
  const indexes: Indexes = {
    byId: new Map(),
    bySlug: new Map(),
    byCategory: new Map(),
    byStage: new Map(),
    byRole: new Map(),
    byNormalizedUrl: new Map(),
  }

  for (const tool of tools) indexOne(indexes, tool)

  return indexes
}

/** One record's worth of buildIndexes's loop body — also `create()`'s way of updating the live indexes without a full rebuild. */
function indexOne(indexes: Indexes, tool: Tool): void {
  indexes.byId.set(tool.id, tool)
  indexes.bySlug.set(tool.slug, tool)
  push(indexes.byCategory, tool.cat, tool)
  for (const stage of tool.stages) push(indexes.byStage, stage, tool)
  for (const role of tool.roles) push(indexes.byRole, role, tool)

  // Every record, active or draft — an unpublished duplicate is still a
  // duplicate. A `url` that somehow fails to parse is left unindexed
  // rather than failing catalogue load over one bad record.
  try {
    indexes.byNormalizedUrl.set(normalizeUrl(tool.url), tool)
  } catch {
    /* left unindexed */
  }
}

function push<K>(map: Map<K, Tool[]>, key: K, tool: Tool): void {
  const bucket = map.get(key)
  if (bucket) bucket.push(tool)
  else map.set(key, [tool])
}

/* ─── Search ───────────────────────────────────────────────────────────────── */

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 100

/**
 * Storage-level free-text matching.
 *
 * Deliberately simple substring matching over name, tagline, summary and tags —
 * the direct analogue of a SQL ILIKE / to_tsvector filter. The RICH ranking that
 * makes "edit videos faster" surface Descript lives in retrieval/, above this
 * layer, because it is a product decision rather than a storage capability.
 */
function textMatchCount(tool: Tool, terms: string[]): number {
  if (terms.length === 0) return 0
  const haystack = [
    tool.name,
    tool.tagline,
    tool.summary,
    tool.tags.join(' '),
    tool.cat,
  ]
    .join(' ')
    .toLowerCase()
  return terms.filter((term) => haystack.includes(term)).length
}

function splitTerms(q: string | undefined): string[] {
  if (!q) return []
  return q
    .toLowerCase()
    .split(/[^a-z0-9+.#]+/)
    .filter((term) => term.length > 1)
}

function intersects(values: readonly string[], wanted: readonly string[]): boolean {
  return wanted.some((value) => values.includes(value))
}

/**
 * A record's intake date as epoch ms, or -Infinity when it has none.
 *
 * -Infinity rather than 0 so an undated record sorts BELOW every dated one under
 * `newest` — including any dated 1970 — instead of landing in the middle of the
 * list. "We do not know when this arrived" is not a claim that it arrived long
 * ago, but it is certainly not a claim that it is new.
 */
function addedAtTime(tool: Tool): number {
  if (!tool.addedAt) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(tool.addedAt)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

function comparator(sort: SortOption, relevance: Map<string, number>) {
  return (a: Tool, b: Tool): number => {
    let primary = 0
    switch (sort) {
      case 'relevance':
        primary = (relevance.get(b.id) ?? 0) - (relevance.get(a.id) ?? 0)
        if (primary === 0) primary = b.pop - a.pop
        break
      case 'popular':
        primary = b.pop - a.pop
        break
      case 'rating':
        primary = b.rating - a.rating
        if (primary === 0) primary = b.reviews - a.reviews
        break
      case 'reviews':
        primary = b.reviews - a.reviews
        break
      case 'name':
        primary = a.name.localeCompare(b.name)
        break
      case 'newest': {
        const left = addedAtTime(a)
        const right = addedAtTime(b)
        // The equality check is what keeps two UNDATED records comparable:
        // -Infinity minus -Infinity is NaN, and a NaN comparator silently
        // corrupts the sort rather than failing.
        primary = left === right ? 0 : right - left
        break
      }
    }
    // Total order. Without a tiebreak the sort is unstable across engines and
    // an offset cursor can skip or repeat a record between pages.
    return primary !== 0 ? primary : a.id.localeCompare(b.id)
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url')
}

/** Returns 0 for anything unparseable — a stale cursor restarts, never throws. */
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (parsed && typeof parsed === 'object' && 'o' in parsed) {
      const offset = (parsed as { o: unknown }).o
      if (typeof offset === 'number' && Number.isInteger(offset) && offset >= 0) {
        return offset
      }
    }
  } catch {
    /* fall through */
  }
  return 0
}

function runSearch(tools: Tool[], indexes: Indexes, query: ToolQuery): ToolPage {
  const status = query.status ?? DEFAULT_STATUS
  const terms = splitTerms(query.q)
  const excluded = new Set(query.excludeIds ?? [])
  const wantedTags = (query.tags ?? []).map((tag) => tag.toLowerCase())

  // Narrowing on a single category first is the one index shortcut worth taking:
  // it is the common case from the browse page and it keeps the scan small.
  const scanned =
    query.categories?.length === 1
      ? (indexes.byCategory.get(query.categories[0] as ToolCategoryName) ?? [])
      : tools

  const relevance = new Map<string, number>()
  const matched: Tool[] = []

  for (const tool of scanned) {
    if (status !== 'all' && tool.status !== status) continue
    if (excluded.has(tool.id)) continue
    if (query.kind === 'mcp' && tool.isMcpServer !== true) continue
    if (query.categories?.length && !query.categories.includes(tool.cat)) continue
    if (query.pricingTiers?.length && !query.pricingTiers.includes(tool.pricingTier)) continue
    if (query.roles?.length && !intersects(tool.roles, query.roles)) continue
    if (query.stages?.length && !intersects(tool.stages, query.stages)) continue
    if (query.minRating !== undefined && tool.rating < query.minRating) continue
    if (
      wantedTags.length > 0 &&
      !tool.tags.some((tag) => wantedTags.includes(tag.toLowerCase()))
    ) {
      continue
    }

    if (terms.length > 0) {
      const hits = textMatchCount(tool, terms)
      if (hits === 0) continue
      relevance.set(tool.id, hits)
    }

    matched.push(tool)
  }

  const sort: SortOption = query.sort ?? (terms.length > 0 ? 'relevance' : 'popular')
  matched.sort(comparator(sort, relevance))

  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const offset = decodeCursor(query.cursor)
  const items = matched.slice(offset, offset + limit)
  const nextOffset = offset + items.length

  const page: ToolPage = { items, total: matched.length }
  if (nextOffset < matched.length) page.nextCursor = encodeCursor(nextOffset)
  return page
}

export type { Taxonomy }
