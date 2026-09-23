/*
 * Automations importer — SPEC-automations.md §8.
 *
 *   npm run import:automations -- [<data root>] [--dry-run]
 *
 * Reads every niche folder under the data root (default: scripts/data/), maps
 * each spreadsheet row to an Automation, validates it through the real schema,
 * and writes one file per niche to src/automations/data/<niche slug>.json.
 * `--dry-run` prints the same report and writes nothing.
 *
 * ── Outside src/, on purpose ─────────────────────────────────────────────────
 *
 * This is an offline tool, not part of the server. It lives outside src/, so
 * boundary.test.ts — which scans src/ only — does not cover it, and it is the
 * only module that imports SheetJS (`xlsx`, a devDependency). Nothing under
 * src/ may import this file: doing so would pull a spreadsheet parser into the
 * server and put the catalogue behind automations/, which §2 forbids. It reads
 * the catalogue through the repository port only to set `catalogueSlug`, and
 * never writes a catalogue record.
 *
 * There is no write method on any automations port. The importer writes JSON
 * files; the server only ever reads them.
 *
 * ── Shape of this file ───────────────────────────────────────────────────────
 *
 * Everything that decides what a record contains is a pure, exported function
 * (header mapping, the per-field parsers, row → record, dedupe, slugs), so the
 * rules are tested without a spreadsheet. `main()` is the only part that
 * touches the filesystem, and it runs only when this file is executed.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as XLSX from 'xlsx'
import { AutomationSchema, parseAutomations } from '../src/automations/schema.ts'
import type { Automation, AutomationTool } from '../src/automations/types.ts'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import { AUTOMATIONS } from '../src/config/limits.ts'
import type { PricingTier, Tool } from '../src/domain/types.ts'
import { slugify, uniqueSlug } from '../src/review/slug.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_ROOT = join(HERE, 'data')
const OUTPUT_DIR = join(HERE, '..', 'src', 'automations', 'data')
const SLUG_MAX = 64

/* ═══ Headers ═══════════════════════════════════════════════════════════════ */

/**
 * Lowercase, parentheticals dropped, punctuation stripped, spaces collapsed.
 * "Task Title (natural-language query)" and "Task Title" both become
 * "task title" — which is what collapses the survey's five header shapes.
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The columns a record is built from, keyed by normalized header. */
export const HEADER_FIELDS = {
  'niche industry': 'sector',
  'audience persona': 'persona',
  'task title': 'title',
  'intent labels synonyms': 'intentLabels',
  'recommended tools': 'tools',
  'workflow summary': 'workflowSummary',
  'sample prompt': 'samplePrompt',
  'beginner friendly': 'beginnerFriendly',
  'quality trust score': 'trustScore',
  'pricing free plan': 'pricingNote',
  'source url': 'sourceUrl',
  'source type': 'sourceType',
  freshness: 'freshness',
  'access rights notes': 'accessNotes',
} as const

export type SheetField = (typeof HEADER_FIELDS)[keyof typeof HEADER_FIELDS]

/** Columns that are expected in some shapes and deliberately not imported. */
const IGNORED_HEADERS = new Set(['id'])

/** Optional in the record, so a sheet without the column still imports. */
const OPTIONAL_FIELDS = new Set<SheetField>(['sector', 'accessNotes'])

export interface HeaderMapping {
  /** Field → column index. */
  columns: Map<SheetField, number>
  /** Headers, verbatim, that map to no field and are not deliberately ignored. */
  unmapped: string[]
  /** Required fields no header mapped to. */
  missing: SheetField[]
  /** Fields more than one header mapped to (the first column wins). */
  duplicated: SheetField[]
}

export function mapHeader(header: readonly string[]): HeaderMapping {
  const columns = new Map<SheetField, number>()
  const unmapped: string[] = []
  const duplicated: SheetField[] = []

  header.forEach((raw, index) => {
    const text = String(raw).trim()
    if (text === '') return
    const normalized = normalizeHeader(text)
    if (IGNORED_HEADERS.has(normalized)) return
    const field = (HEADER_FIELDS as Record<string, SheetField | undefined>)[normalized]
    if (!field) {
      unmapped.push(text)
      return
    }
    if (columns.has(field)) {
      duplicated.push(field)
      return
    }
    columns.set(field, index)
  })

  const missing = Object.values(HEADER_FIELDS).filter(
    (field) => !columns.has(field) && !OPTIONAL_FIELDS.has(field),
  )
  return { columns, unmapped, missing, duplicated }
}

/* ═══ Field parsers ═════════════════════════════════════════════════════════ */

/** Split on ';' when the cell has one, otherwise on ','. Trimmed, no empties. */
export function splitIntentLabels(cell: string): string[] {
  const separator = cell.includes(';') ? ';' : ','
  return cell
    .split(separator)
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
}

export type BeginnerParse =
  | { ok: true; value: 'yes' | 'somewhat' | 'no'; note?: string }
  | { ok: false; error: string }

/**
 * The leading word (yes / somewhat / no, any case), then ' - ', ' — ', ' (' or
 * nothing. The remainder, if any, is the note. A " (" remainder loses its
 * closing parenthesis, so "somewhat (needs setup)" notes "needs setup".
 */
export function parseBeginnerFriendly(cell: string): BeginnerParse {
  const match = /^\s*(yes|somewhat|no)(?=$|[\s(—-])/i.exec(cell)
  if (!match) return { ok: false, error: `unrecognised leading word in "${cell.slice(0, 40)}"` }

  const value = (match[1] ?? '').toLowerCase() as 'yes' | 'somewhat' | 'no'
  let rest = cell.slice(match[0].length).trim()
  let parenthetical = false
  if (rest.startsWith('(')) {
    parenthetical = true
    rest = rest.slice(1)
  } else if (/^[—-]/.test(rest)) {
    rest = rest.replace(/^[—-]+/, '')
  }
  rest = rest.trim()
  if (parenthetical) rest = rest.replace(/\)\s*$/, '').trim()

  return rest ? { ok: true, value, note: rest } : { ok: true, value }
}

/** The leading digit: handles "3" and "3/5 - prose". */
export function parseTrustScore(cell: string): 1 | 2 | 3 | 4 | 5 | undefined {
  const match = /^\s*([1-5])(?!\d)/.exec(cell)
  return match ? (Number(match[1]) as 1 | 2 | 3 | 4 | 5) : undefined
}

export type PricingRule =
  | 'trial-only'
  | 'free-plan'
  | 'free-and-paid'
  | 'free-only'
  | 'paid-signal'
  | 'free-named-plan'
  | 'free-and-paid-tier'
  | 'default'

const DOLLAR_AMOUNT = /\$\s?\d/

/**
 * The pricing tier from the note, by the first rule that fires. Anything the
 * rules do not recognise is 'paid' — erring toward paid is deliberate: calling
 * a paid tool free is the worse mistake for a reader.
 */
export function derivePricingTier(note: string): { tier: PricingTier; rule: PricingRule } {
  const text = note.toLowerCase()
  const hasFree = /\bfree\b/.test(text)

  if (/\bfree trials?\b/.test(text) && !/\bfree\b/.test(text.replace(/\bfree trials?\b/g, ''))) {
    return { tier: 'paid', rule: 'trial-only' }
  }
  if (/\bfree (plan|tier|version|forever|account)\b/.test(text)) {
    return { tier: 'freemium', rule: 'free-plan' }
  }
  // "Free Basic plan", "Free Starter plan". Beside free-plan rather than at the
  // end: after free-only, "Free Starter plan" alone would already be 'free'.
  if (/\bfree \w+ plan\b/.test(text)) {
    return { tier: 'freemium', rule: 'free-named-plan' }
  }
  if (hasFree && (DOLLAR_AMOUNT.test(text) || /\bpaid plans?\b/.test(text))) {
    return { tier: 'freemium', rule: 'free-and-paid' }
  }
  // "free" beside "paid tiers" rather than "paid plan". Before paid-signal, so
  // "free, paid tiers by quote" is freemium, not paid.
  if (hasFree && /\bpaid (tier|subscription|version)s?\b/.test(text)) {
    return { tier: 'freemium', rule: 'free-and-paid-tier' }
  }
  if (hasFree && !/\bpaid\b/.test(text)) {
    return { tier: 'free', rule: 'free-only' }
  }
  if (/custom|quote|contact sales|not published/.test(text) || DOLLAR_AMOUNT.test(text)) {
    return { tier: 'paid', rule: 'paid-signal' }
  }
  return { tier: 'paid', rule: 'default' }
}

/**
 * Tool names in a Recommended Tools cell: split on ';' if the cell has one,
 * else on ',', then each piece on ' / '. Every split ignores separators inside
 * parentheses, so "Todoist (AI Assist; Task Assist)" and "Gainsight (PX,
 * analytics)" each stay one tool.
 */
export function splitToolNames(cell: string): string[] {
  const separator = splitOutsideParens(cell, ';').length > 1 ? ';' : ','
  return splitOutsideParens(cell, separator)
    .flatMap((piece) => splitOutsideParens(piece, ' / '))
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

function splitOutsideParens(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i))
      start = i + separator.length
      i = start - 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/* ═══ Catalogue matching ════════════════════════════════════════════════════ */

const toolKey = (name: string): string => normalizeHeader(name)

export interface CatalogueMatcher {
  match(name: string): Tool | undefined
}

/**
 * Confident means exact: the name, parentheticals and punctuation aside,
 * equals a catalogue tool's name or slug. A key two catalogue tools share
 * matches neither. Near-misses ("Google NotebookLM" for NotebookLM) stay
 * unmatched — a wrong catalogueSlug is worse than none.
 */
export function createCatalogueMatcher(tools: readonly Tool[]): CatalogueMatcher {
  const byKey = new Map<string, Tool | null>()
  const add = (key: string, tool: Tool) => {
    if (!key) return
    const existing = byKey.get(key)
    if (existing === undefined) byKey.set(key, tool)
    else if (existing !== null && existing.id !== tool.id) byKey.set(key, null)
  }
  for (const tool of tools) {
    add(toolKey(tool.name), tool)
    add(toolKey(tool.slug.replace(/-/g, ' ')), tool)
  }
  return {
    match(name) {
      return byKey.get(toolKey(name)) ?? undefined
    },
  }
}

/**
 * Every named tool is kept. The row has one Source URL and it belongs to the
 * first tool, so only tools[0] carries a url; a later tool is a name (plus
 * `catalogueSlug` on a confident match) and no link, rather than a link to a
 * page about some other tool. (SPEC-automations.md §3.)
 *
 * One exception: a LATER tool whose name is over the cap is dropped. In the
 * surveyed data those are prose alternatives ("or a DIY workflow using Claude
 * or ChatGPT plus…"), not tool names, and they should not fail the row. An
 * over-long FIRST tool is kept, so validation fails the row — that cell is a
 * category description standing in for the one tool the row is about.
 */
export function buildTools(
  cell: string,
  sourceUrl: string,
  matcher: CatalogueMatcher,
): { tools: AutomationTool[]; matched: number; dropped: string[] } {
  let matched = 0
  const tools: AutomationTool[] = []
  const dropped: string[] = []
  splitToolNames(cell).forEach((name, index) => {
    if (index > 0 && name.length > AUTOMATIONS.toolNameMaxChars) {
      dropped.push(name)
      return
    }
    const hit = matcher.match(name)
    if (hit) matched += 1
    tools.push({
      name,
      ...(index === 0 ? { url: sourceUrl } : {}),
      ...(hit ? { catalogueSlug: hit.slug } : {}),
    })
  })
  return { tools, matched, dropped }
}

/* ═══ Row → record ══════════════════════════════════════════════════════════ */

/** One spreadsheet row, as cells keyed by field. Absent columns are absent keys. */
export type SheetRow = Partial<Record<SheetField, string>>

export interface RowSource {
  /** The folder name — the niche. */
  niche: string
  /** Which import run produced the row, e.g. "Students AI Workflows Batch2". */
  batch: string
}

export interface MappedRow {
  /** Everything but `id` and `slug`, which need the whole niche to assign. */
  draft: Record<string, unknown>
  /** Fields that could not be parsed at all, as "field: reason". */
  errors: string[]
  pricingRule?: PricingRule
  matchedTools: number
  /** Later tools over the name cap, dropped (see buildTools). */
  droppedTools: string[]
}

const cellOf = (row: SheetRow, field: SheetField): string => (row[field] ?? '').trim()

/**
 * Pure. Values that parse are set; values that do not are reported in
 * `errors` and left out, so schema validation still names every OTHER bad
 * field of the same row in one pass.
 */
export function rowToDraft(row: SheetRow, source: RowSource, matcher: CatalogueMatcher): MappedRow {
  const errors: string[] = []
  const draft: Record<string, unknown> = {
    kind: 'workflow',
    niche: source.niche,
    persona: cellOf(row, 'persona'),
    title: cellOf(row, 'title'),
    intentLabels: splitIntentLabels(cellOf(row, 'intentLabels')),
    workflowSummary: cellOf(row, 'workflowSummary'),
    samplePrompt: cellOf(row, 'samplePrompt'),
    pricingNote: cellOf(row, 'pricingNote'),
    sourceUrl: cellOf(row, 'sourceUrl'),
    sourceType: cellOf(row, 'sourceType'),
    freshness: cellOf(row, 'freshness'),
    batch: source.batch,
    status: 'active',
  }

  const sector = cellOf(row, 'sector')
  if (sector) draft.sector = sector
  const accessNotes = cellOf(row, 'accessNotes')
  if (accessNotes) draft.accessNotes = accessNotes

  const beginner = parseBeginnerFriendly(cellOf(row, 'beginnerFriendly'))
  if (beginner.ok) {
    draft.beginnerFriendly = beginner.value
    if (beginner.note) draft.beginnerNote = beginner.note
  } else {
    errors.push(`beginnerFriendly: ${beginner.error}`)
  }

  const trust = parseTrustScore(cellOf(row, 'trustScore'))
  if (trust !== undefined) draft.trustScore = trust
  else errors.push(`trustScore: no leading 1-5 digit in "${cellOf(row, 'trustScore').slice(0, 40)}"`)

  const pricing = derivePricingTier(cellOf(row, 'pricingNote'))
  draft.pricingTier = pricing.tier

  const built = buildTools(cellOf(row, 'tools'), cellOf(row, 'sourceUrl'), matcher)
  draft.tools = built.tools

  return {
    draft,
    errors,
    pricingRule: pricing.rule,
    matchedTools: built.matched,
    droppedTools: built.dropped,
  }
}

/** Title as a dedupe key: case, punctuation and spacing ignored. */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Keeps the FIRST row for each (niche, normalized title). Later batches repeat
 * earlier ones whole (docs/BATCH-SURVEY.md §6), so first-wins keeps the
 * original and drops the copies. Rows with no title are kept for validation
 * to report.
 */
export function dedupeRows<T extends { niche: string; title: string }>(
  rows: readonly T[],
): { kept: T[]; dropped: T[] } {
  const seen = new Set<string>()
  const kept: T[] = []
  const dropped: T[] = []
  for (const row of rows) {
    const title = normalizeTitle(row.title)
    const key = `${row.niche}\u0000${title}`
    if (title && seen.has(key)) {
      dropped.push(row)
      continue
    }
    if (title) seen.add(key)
    kept.push(row)
  }
  return { kept, dropped }
}

/**
 * Slugs from titles, unique within one niche: the second "Plan my week" is
 * `plan-my-week-2`. Truncated to 64 at a hyphen (review/slug.ts).
 */
export function assignSlugs(titles: readonly string[]): string[] {
  const used = new Set<string>()
  return titles.map((title) => {
    const slug = uniqueSlug(slugify(title), used, SLUG_MAX)
    used.add(slug)
    return slug
  })
}

/**
 * Stable across re-imports while the title is unchanged, and short enough for
 * AUTOMATIONS.idMaxChars. It cannot survive a title edit — nothing in the
 * sheet identifies a row across edits.
 */
export function automationId(niche: string, title: string): string {
  const hash = createHash('sha1').update(`${niche}\n${normalizeTitle(title)}`).digest('hex')
  return `${slugify(niche)}-${hash.slice(0, 10)}`
}

/* ═══ Spreadsheets ══════════════════════════════════════════════════════════ */

interface SheetFile {
  niche: string
  path: string
  name: string
}

interface ReadRow {
  file: SheetFile
  /** 1-based spreadsheet row. */
  rowNumber: number
  niche: string
  title: string
  cells: SheetRow
}

interface FileReport {
  file: SheetFile
  sheet?: string
  mapping?: HeaderMapping
  header?: string[]
  rows: number
  error?: string
}

function listFiles(root: string): { files: SheetFile[]; emptyFolders: string[] } {
  const files: SheetFile[] = []
  const emptyFolders: string[] = []
  const folders = readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort()
  for (const niche of folders) {
    const names = readdirSync(join(root, niche))
      .filter((name) => extname(name).toLowerCase() === '.xlsx' && !name.startsWith('~$'))
      .sort()
    if (names.length === 0) emptyFolders.push(niche)
    for (const name of names) files.push({ niche, name, path: join(root, niche, name) })
  }
  return { files, emptyFolders }
}

function readFileRows(file: SheetFile): { report: FileReport; rows: ReadRow[] } {
  const report: FileReport = { file, rows: 0 }
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(readFileSync(file.path))
  } catch (error) {
    report.error = `failed to open: ${error instanceof Error ? error.message : String(error)}`
    return { report, rows: [] }
  }

  // The data sheet is the one whose ROW 1 names a Task Title column. Sheet
  // order is not assumed; a README that mentions "task title" further down
  // does not qualify.
  const candidates = workbook.SheetNames.filter((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) return false
    const [first] = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false })
    return (first ?? []).some((cell) => /task title/i.test(String(cell)))
  })
  if (candidates.length !== 1) {
    report.error =
      candidates.length === 0
        ? `no sheet has "Task Title" in row 1 (sheets: ${workbook.SheetNames.join(', ')})`
        : `${candidates.length} sheets have "Task Title" in row 1: ${candidates.join(', ')}`
    return { report, rows: [] }
  }

  const sheetName = candidates[0] as string
  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName] as XLSX.WorkSheet, {
    header: 1,
    defval: '',
    raw: false,
  })
  const header = (grid[0] ?? []).map((cell) => String(cell))
  const mapping = mapHeader(header)
  report.sheet = sheetName
  report.header = header
  report.mapping = mapping

  const rows: ReadRow[] = []
  grid.slice(1).forEach((cells, index) => {
    if (!cells.some((cell) => String(cell).trim() !== '')) return
    const row: SheetRow = {}
    for (const [field, column] of mapping.columns) row[field] = String(cells[column] ?? '')
    rows.push({
      file,
      rowNumber: index + 2,
      niche: file.niche,
      title: (row.title ?? '').trim(),
      cells: row,
    })
  })
  report.rows = rows.length
  return { report, rows }
}

/** "Students_AI_Workflows_Batch2.xlsx" → "Students AI Workflows Batch2". */
function batchName(fileName: string): string {
  return basename(fileName, extname(fileName)).replace(/_+/g, ' ').trim()
}

async function loadCatalogueTools(): Promise<Tool[]> {
  const catalogue = createJsonToolCatalogue()
  const tools: Tool[] = []
  let cursor: string | undefined
  do {
    const page = await catalogue.search({ limit: 100, ...(cursor ? { cursor } : {}) })
    tools.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return tools
}

/* ═══ Main ══════════════════════════════════════════════════════════════════ */

interface Failure {
  file: string
  row: number
  title: string
  problems: string[]
}

async function main(argv: readonly string[]): Promise<number> {
  const dryRun = argv.includes('--dry-run')
  const rootArg = argv.find((arg) => !arg.startsWith('--'))
  const root = resolve(rootArg ?? DEFAULT_DATA_ROOT)
  const out: string[] = []
  const say = (line = '') => out.push(line)

  const { files, emptyFolders } = listFiles(root)
  const matcher = createCatalogueMatcher(await loadCatalogueTools())

  const reports: FileReport[] = []
  const allRows: ReadRow[] = []
  for (const file of files) {
    const { report, rows } = readFileRows(file)
    reports.push(report)
    allRows.push(...rows)
  }

  /* ── Header mapping ─────────────────────────────────────────────────── */
  say(`Automations import${dryRun ? ' — DRY RUN, nothing written' : ''}`)
  say(`Source: ${root}`)
  say(`${files.length} files in ${new Set(files.map((f) => f.niche)).size} niche folders; empty folders: ${emptyFolders.join(', ') || 'none'}`)
  say()
  say('== Header mapping ==')
  const headerToField = new Map<string, string>()
  for (const report of reports) {
    for (const raw of report.header ?? []) {
      const text = raw.trim()
      if (!text) continue
      const normalized = normalizeHeader(text)
      const field = IGNORED_HEADERS.has(normalized)
        ? '(ignored)'
        : ((HEADER_FIELDS as Record<string, string | undefined>)[normalized] ?? 'UNMAPPED')
      headerToField.set(text, field)
    }
  }
  for (const [header, field] of [...headerToField].sort((a, b) => a[1].localeCompare(b[1]))) {
    say(`  ${JSON.stringify(header).padEnd(44)} → ${field}`)
  }
  const unreadable = reports.filter((r) => r.error)
  const unmappedFiles = reports.filter((r) => r.mapping && (r.mapping.unmapped.length || r.mapping.duplicated.length))
  const missingFiles = reports.filter((r) => r.mapping && r.mapping.missing.length)
  say(`  ${headerToField.size} distinct raw headers → ${new Set([...headerToField.values()].filter((f) => !f.startsWith('('))).size} fields`)
  say(`  Files with an unmapped or duplicated header: ${unmappedFiles.length}`)
  for (const r of unmappedFiles) say(`    ${r.file.niche}/${r.file.name}: unmapped ${JSON.stringify(r.mapping?.unmapped)} duplicated ${JSON.stringify(r.mapping?.duplicated)}`)
  say(`  Files missing a required field: ${missingFiles.length}`)
  for (const r of missingFiles) say(`    ${r.file.niche}/${r.file.name}: missing ${r.mapping?.missing.join(', ')}`)
  say(`  Files that could not be read: ${unreadable.length}`)
  for (const r of unreadable) say(`    ${r.file.niche}/${r.file.name}: ${r.error}`)
  say()

  /* ── Dedupe, map, validate ──────────────────────────────────────────── */
  const { kept, dropped } = dedupeRows(allRows)
  const failures: Failure[] = []
  const pricingRules = new Map<PricingRule, number>()
  const valid = new Map<string, Automation[]>()
  let keptToolCount = 0
  const droppedTools: Array<{ where: string; name: string }> = []
  let matchedToolCount = 0
  let multiToolRows = 0

  const byNiche = new Map<string, ReadRow[]>()
  for (const row of kept) {
    const list = byNiche.get(row.niche) ?? []
    list.push(row)
    byNiche.set(row.niche, list)
  }

  for (const [niche, rows] of byNiche) {
    const slugs = assignSlugs(rows.map((row) => row.title))
    rows.forEach((row, index) => {
      const mapped = rowToDraft(row.cells, { niche, batch: batchName(row.file.name) }, matcher)
      if (mapped.pricingRule) pricingRules.set(mapped.pricingRule, (pricingRules.get(mapped.pricingRule) ?? 0) + 1)
      keptToolCount += (mapped.draft.tools as AutomationTool[]).length
      matchedToolCount += mapped.matchedTools
      for (const name of mapped.droppedTools) {
        droppedTools.push({ where: `${row.file.niche}/${row.file.name} row ${row.rowNumber}`, name })
      }
      if (splitToolNames(row.cells.tools ?? '').length > 1) multiToolRows += 1

      const record = {
        id: automationId(niche, row.title),
        slug: slugs[index],
        ...mapped.draft,
      }
      const parsed = AutomationSchema.safeParse(record)
      const problems = [...mapped.errors]
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const path = issue.path.length ? issue.path.join('.') : '(record)'
          if (!mapped.errors.some((e) => e.startsWith(`${String(issue.path[0])}:`))) problems.push(`${path}: ${issue.message}`)
        }
      }
      if (problems.length > 0) {
        failures.push({ file: `${row.file.niche}/${row.file.name}`, row: row.rowNumber, title: row.title, problems })
        return
      }
      const list = valid.get(niche) ?? []
      list.push(parsed.data as Automation)
      valid.set(niche, list)
    })
  }

  /* ── Per niche ──────────────────────────────────────────────────────── */
  say('== Rows per niche ==')
  say(`  ${'Niche'.padEnd(34)} ${'read'.padStart(5)} ${'dupes'.padStart(6)} ${'kept'.padStart(5)} ${'valid'.padStart(6)} ${'failed'.padStart(7)}  output`)
  const niches = [...new Set(allRows.map((r) => r.niche))].sort()
  const totals = { read: 0, dupes: 0, kept: 0, valid: 0, failed: 0 }
  for (const niche of niches) {
    const read = allRows.filter((r) => r.niche === niche).length
    const dupes = dropped.filter((r) => r.niche === niche).length
    const keptCount = read - dupes
    const validCount = valid.get(niche)?.length ?? 0
    const failed = keptCount - validCount
    Object.assign(totals, {
      read: totals.read + read,
      dupes: totals.dupes + dupes,
      kept: totals.kept + keptCount,
      valid: totals.valid + validCount,
      failed: totals.failed + failed,
    })
    say(`  ${niche.padEnd(34)} ${String(read).padStart(5)} ${String(dupes).padStart(6)} ${String(keptCount).padStart(5)} ${String(validCount).padStart(6)} ${String(failed).padStart(7)}  ${slugify(niche)}.json`)
  }
  say(`  ${'TOTAL'.padEnd(34)} ${String(totals.read).padStart(5)} ${String(totals.dupes).padStart(6)} ${String(totals.kept).padStart(5)} ${String(totals.valid).padStart(6)} ${String(totals.failed).padStart(7)}`)
  say()

  /* ── Pricing ────────────────────────────────────────────────────────── */
  say('== Pricing tier (rows kept after dedupe) ==')
  const RULE_LABEL: Record<PricingRule, string> = {
    'trial-only': 'free trial only            → paid',
    'free-plan': 'free plan/tier/version/…  → freemium',
    'free-named-plan': 'free <word> plan  (NEW)    → freemium',
    'free-and-paid': 'free + $ or "paid plan"    → freemium',
    'free-and-paid-tier': 'free + paid tier/sub (NEW) → freemium',
    'free-only': 'free, no paid mention      → free',
    'paid-signal': 'custom/quote/…/$ amount    → paid',
    default: 'no rule matched (DEFAULT)  → paid',
  }
  for (const rule of Object.keys(RULE_LABEL) as PricingRule[]) say(`  ${RULE_LABEL[rule]}: ${pricingRules.get(rule) ?? 0}`)
  say(`  Fell through to the default: ${pricingRules.get('default') ?? 0}`)
  say()

  /* ── Tools ──────────────────────────────────────────────────────────── */
  say('== Tools ==')
  say(`  Rows naming more than one tool: ${multiToolRows}`)
  say(`  Tools kept (rows kept after dedupe): ${keptToolCount}`)
  say(`  Tool names matched to a catalogue record: ${matchedToolCount}`)
  say(`  Later tools dropped (name over ${AUTOMATIONS.toolNameMaxChars} characters): ${droppedTools.length}`)
  for (const { where, name } of droppedTools) say(`    ${where} (${name.length}): ${name}`)
  say()

  /* ── Failures ───────────────────────────────────────────────────────── */
  say(`== Failed validation: ${failures.length} rows ==`)
  for (const failure of failures) {
    say(`  ${failure.file} row ${failure.row} — "${failure.title.slice(0, 70)}"`)
    for (const problem of failure.problems) say(`      ${problem}`)
  }
  say()

  /* ── Write ──────────────────────────────────────────────────────────── */
  if (dryRun) {
    say(`Dry run: would write ${valid.size} files to ${OUTPUT_DIR}`)
  } else {
    mkdirSync(OUTPUT_DIR, { recursive: true })
    for (const [niche, records] of valid) {
      // The same whole-file check the server runs at boot: ids and slugs unique.
      parseAutomations(records, { origin: niche })
      const target = join(OUTPUT_DIR, `${slugify(niche)}.json`)
      writeFileSync(target, `${JSON.stringify(records, null, 2)}\n`)
    }
    say(`Wrote ${valid.size} files to ${OUTPUT_DIR}`)
  }

  console.log(out.join('\n'))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
