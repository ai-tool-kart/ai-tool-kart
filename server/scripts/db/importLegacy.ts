/*
 * npm run db:import — import the pre-database JSON files into Postgres.
 *
 *   npm run db:import -- --submissions <file>            DRY RUN (default)
 *   npm run db:import -- --tools-only                    DRY RUN, catalogue only
 *   npm run db:import -- --submissions <file> --apply    writes
 *
 *   --tools <file>   defaults to src/catalogue/data/tools.json. For production
 *                    pass the file pulled from the Railway container, which
 *                    may differ from git if the review script ever ran there.
 *
 * DRY RUN is the default and writes NOTHING — not to the database, not to
 * disk. It validates both files, maps every record, and compares the result
 * with what the target database already holds (read-only queries).
 *
 * --apply, in order:
 *   1. refuses if the dry-run plan has any conflict
 *   2. snapshots the source files + sha256 manifest into backups/import-<ts>/
 *   3. pg_dumps the target database into the same folder
 *   4. one transaction: insert new tools, insert new submissions each with a
 *      LEGACY_IMPORTED audit event, one data_import_runs row per file
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Keyed on the preserved primary keys (tool id, submission uuid):
 *   absent in DB                  → inserted
 *   present and identical         → unchanged, skipped
 *   present but different, or the slug / URL is held by another record
 *                                 → CONFLICT; never overwritten, --apply refuses
 * So re-running the same file is a no-op, and a re-run after a crash finishes
 * the job: the transaction means a crash leaves nothing half-imported.
 */

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { parseCatalogue } from '../../src/catalogue/schema.ts'
import { createDatabase, type Database } from '../../src/db/client.ts'
import {
  diffSubmissionRow,
  LegacySubmissionSchema,
  legacySubmissionToRow,
  rowToTool,
  toolsEqual,
  toolToRow,
  type MappedSubmission,
} from '../../src/db/legacy/mapping.ts'
import { assertDatabaseTarget, type DatabaseTarget } from '../../src/db/target.ts'
import type { Tool } from '../../src/domain/types.ts'
import type { Prisma } from '../../src/generated/prisma/client.ts'
import { BACKUP_DIR, pgDump, timestamp } from './pgDump.ts'

const DEFAULT_TOOLS_FILE = join(process.cwd(), 'src', 'catalogue', 'data', 'tools.json')
const LIVE_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED'])

interface SourceFile {
  path: string
  sha256: string
  contents: string
}

type Outcome = 'insert' | 'unchanged' | 'conflict'

interface ToolPlan {
  tool: Tool
  row: Prisma.ToolCreateInput
  outcome: Outcome
  reason?: string
}

interface SubmissionPlan {
  mapped: MappedSubmission
  outcome: Outcome
  reason?: string
}

async function readSource(path: string): Promise<SourceFile> {
  const contents = await readFile(path, 'utf8')
  return { path, contents, sha256: createHash('sha256').update(contents).digest('hex') }
}

function parseJson(file: SourceFile): unknown {
  try {
    return JSON.parse(file.contents)
  } catch (error) {
    throw new Error(`${file.path} is not valid JSON: ${(error as Error).message}`)
  }
}

/* ── Planning (read-only) ────────────────────────────────────────────────── */

async function planTools(db: Database, tools: Tool[], submissionToolIds: Set<string>): Promise<ToolPlan[]> {
  const existing = await db.tool.findMany()
  const byId = new Map(existing.map((row) => [row.id, row]))
  const bySlug = new Map(existing.map((row) => [row.slug, row.id]))
  const byUrl = new Map(existing.map((row) => [row.normalizedUrl, row.id]))

  return tools.map((tool) => {
    const row = toolToRow(tool, submissionToolIds.has(tool.id) ? 'submission' : 'seed')
    const current = byId.get(tool.id)
    if (current) {
      return toolsEqual(rowToTool(current), tool)
        ? { tool, row, outcome: 'unchanged' }
        : { tool, row, outcome: 'conflict', reason: 'already in the database with different content' }
    }
    const slugOwner = bySlug.get(tool.slug)
    if (slugOwner) return { tool, row, outcome: 'conflict', reason: `slug already used by "${slugOwner}"` }
    const urlOwner = byUrl.get(row.normalizedUrl)
    if (urlOwner) return { tool, row, outcome: 'conflict', reason: `URL already used by "${urlOwner}"` }
    return { tool, row, outcome: 'insert' }
  })
}

async function planSubmissions(db: Database, mapped: MappedSubmission[]): Promise<SubmissionPlan[]> {
  const existing = await db.submission.findMany()
  const byId = new Map(existing.map((row) => [row.id, row]))
  const liveUrlOwner = new Map(
    existing.filter((row) => LIVE_STATUSES.has(row.status)).map((row) => [row.normalizedUrl, row.id]),
  )
  const claimedInFile = new Map<string, string>()

  return mapped.map((entry) => {
    const { row } = entry
    const current = byId.get(row.id as string)
    if (current) {
      const differing = diffSubmissionRow(row, current as unknown as Record<string, unknown>)
      return differing.length === 0
        ? { mapped: entry, outcome: 'unchanged' }
        : { mapped: entry, outcome: 'conflict', reason: `already in the database; differs in ${differing.join(', ')}` }
    }
    if (LIVE_STATUSES.has(row.status as string)) {
      const owner = liveUrlOwner.get(row.normalizedUrl) ?? claimedInFile.get(row.normalizedUrl)
      if (owner) {
        return { mapped: entry, outcome: 'conflict', reason: `another live submission (${owner}) has this URL` }
      }
      claimedInFile.set(row.normalizedUrl, row.id as string)
    }
    return { mapped: entry, outcome: 'insert' }
  })
}

function count<T extends { outcome: Outcome }>(plans: T[], outcome: Outcome): number {
  return plans.filter((plan) => plan.outcome === outcome).length
}

/* ── Apply ───────────────────────────────────────────────────────────────── */

async function snapshot(
  sources: SourceFile[],
  target: DatabaseTarget,
  rawUrl: string,
  summary: Record<string, unknown>,
): Promise<string> {
  const dir = join(BACKUP_DIR, `import-${timestamp()}`)
  await mkdir(dir, { recursive: true })
  for (const source of sources) await copyFile(source.path, join(dir, basename(source.path)))
  const dump = await pgDump(rawUrl, target, 'pre-import')
  await writeFile(
    join(dir, 'manifest.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        database: target.redacted,
        databaseDump: dump,
        sources: sources.map(({ path, sha256 }) => ({ path: resolve(path), sha256 })),
        plan: summary,
      },
      null,
      2,
    ),
  )
  return dir
}

async function apply(
  db: Database,
  toolPlans: ToolPlan[],
  submissionPlans: SubmissionPlan[],
  toolsSource: SourceFile,
  submissionsSource: SourceFile | undefined,
  snapshotDir: string,
): Promise<void> {
  const startedAt = new Date()
  await db.$transaction(
    async (tx) => {
      const newTools = toolPlans.filter((plan) => plan.outcome === 'insert')
      if (newTools.length > 0) await tx.tool.createMany({ data: newTools.map((plan) => plan.row) })
      await tx.dataImportRun.create({
        data: {
          source: basename(toolsSource.path),
          sourceSha256: toolsSource.sha256,
          recordCount: toolPlans.length,
          inserted: newTools.length,
          unchanged: count(toolPlans, 'unchanged'),
          conflicts: 0,
          details: { snapshotDir },
          startedAt,
          finishedAt: new Date(),
        },
      })

      if (!submissionsSource) return
      const run = await tx.dataImportRun.create({
        data: {
          source: basename(submissionsSource.path),
          sourceSha256: submissionsSource.sha256,
          recordCount: submissionPlans.length,
          inserted: count(submissionPlans, 'insert'),
          unchanged: count(submissionPlans, 'unchanged'),
          conflicts: 0,
          details: { snapshotDir },
          startedAt,
          finishedAt: new Date(),
        },
      })
      for (const plan of submissionPlans) {
        if (plan.outcome !== 'insert') continue
        const { row, eventMetadata } = plan.mapped
        await tx.submission.create({ data: row })
        await tx.submissionEvent.create({
          data: {
            submissionId: row.id as string,
            actorType: 'SYSTEM',
            eventType: 'LEGACY_IMPORTED',
            fromStatus: null,
            toStatus: row.status ?? null,
            metadata: { ...eventMetadata, importRunId: run.id },
          },
        })
      }
    },
    { timeout: 120_000 },
  )
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tools: { type: 'string' },
      submissions: { type: 'string' },
      'tools-only': { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
    },
  })
  if (values.submissions && values['tools-only']) throw new Error('Pass --submissions or --tools-only, not both.')

  const target = assertDatabaseTarget(process.env.DATABASE_URL)
  const rawUrl = process.env.DATABASE_URL as string
  const mode = values.apply ? 'APPLY' : 'DRY RUN (nothing will be written)'
  const out = (line = '') => process.stdout.write(`${line}\n`)

  out(`Mode:      ${mode}`)
  out(`Database:  ${target.redacted}${target.isLocal ? '  (local)' : '  (REMOTE)'}`)

  // ── Read + validate sources ────────────────────────────────────────────────
  const toolsSource = await readSource(values.tools ?? DEFAULT_TOOLS_FILE)
  const tools = parseCatalogue(parseJson(toolsSource), { origin: toolsSource.path })
  out(`Tools:     ${toolsSource.path}  sha256=${toolsSource.sha256.slice(0, 16)}…  records=${tools.length}`)

  let submissionsSource: SourceFile | undefined
  let mapped: MappedSubmission[] = []
  const submissionToolIds = new Set<string>()

  if (values.submissions) {
    submissionsSource = await readSource(values.submissions)
    const raw = parseJson(submissionsSource)
    if (!Array.isArray(raw)) throw new Error(`${submissionsSource.path} must be a JSON array.`)

    const problems: string[] = []
    const legacy = raw.flatMap((record: unknown, index: number) => {
      const parsed = LegacySubmissionSchema.safeParse(record)
      if (parsed.success) return [parsed.data]
      for (const issue of parsed.error.issues) problems.push(`  [${index}] ${issue.path.join('.') || '(record)'}: ${issue.message}`)
      return []
    })
    if (problems.length > 0) throw new Error(`Invalid records in ${submissionsSource.path}:\n${problems.join('\n')}`)
    const ids = legacy.map((record) => record.id)
    if (new Set(ids).size !== ids.length) throw new Error(`${submissionsSource.path} contains duplicate ids.`)

    const toolIdByUrl = new Map(tools.map((tool) => [toolToRow(tool).normalizedUrl, tool.id]))
    mapped = legacy.map((record) => legacySubmissionToRow(record, (url) => toolIdByUrl.get(url)))
    for (const entry of mapped) if (entry.row.toolId) submissionToolIds.add(entry.row.toolId)
    out(`Submissions: ${submissionsSource.path}  sha256=${submissionsSource.sha256.slice(0, 16)}…  records=${legacy.length}`)
  } else if (values['tools-only']) {
    out('Submissions: skipped (--tools-only)')
  } else {
    throw new Error(
      'No submissions file given. Pass --submissions <path to the production submissions.json>,\n' +
        'or --tools-only if production has none (confirm that on Railway first).',
    )
  }

  // ── Plan against the database (read-only) ──────────────────────────────────
  const db = createDatabase(rawUrl)
  try {
    const toolPlans = await planTools(db, tools, submissionToolIds)
    const submissionPlans = await planSubmissions(db, mapped)

    out()
    out(`Tools        insert=${count(toolPlans, 'insert')}  unchanged=${count(toolPlans, 'unchanged')}  conflict=${count(toolPlans, 'conflict')}`)
    out(`             of which source=submission: ${submissionToolIds.size}`)
    if (submissionsSource) {
      const byStatus = new Map<string, number>()
      for (const entry of mapped) byStatus.set(entry.row.status as string, (byStatus.get(entry.row.status as string) ?? 0) + 1)
      out(
        `Submissions  insert=${count(submissionPlans, 'insert')}  unchanged=${count(submissionPlans, 'unchanged')}  conflict=${count(submissionPlans, 'conflict')}`,
      )
      out(`             statuses after mapping: ${[...byStatus].map(([s, n]) => `${s}=${n}`).join(' ') || '(none)'}`)
    }
    for (const plan of toolPlans.filter((p) => p.outcome === 'conflict')) out(`  CONFLICT tool ${plan.tool.id}: ${plan.reason}`)
    for (const plan of submissionPlans.filter((p) => p.outcome === 'conflict')) {
      out(`  CONFLICT submission ${plan.mapped.row.id}: ${plan.reason}`)
    }
    for (const entry of mapped) for (const warning of entry.warnings) out(`  note ${entry.row.id}: ${warning}`)

    const conflicts = count(toolPlans, 'conflict') + count(submissionPlans, 'conflict')
    if (!values.apply) {
      out()
      out('DRY RUN complete. Nothing was written. Re-run with --apply to import.')
      return
    }
    if (conflicts > 0) throw new Error(`Refusing to apply: ${conflicts} conflict(s) above. Nothing was written.`)

    const sources = submissionsSource ? [toolsSource, submissionsSource] : [toolsSource]
    const snapshotDir = await snapshot(sources, target, rawUrl, {
      tools: { insert: count(toolPlans, 'insert'), unchanged: count(toolPlans, 'unchanged') },
      submissions: { insert: count(submissionPlans, 'insert'), unchanged: count(submissionPlans, 'unchanged') },
    })
    out(`Snapshot:  ${snapshotDir}`)

    await apply(db, toolPlans, submissionPlans, toolsSource, submissionsSource, snapshotDir)
    out(`Applied. tools=${await db.tool.count()} submissions=${await db.submission.count()} events=${await db.submissionEvent.count()}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`\n${(error as Error).message}\n\n`)
  process.exitCode = 1
})
