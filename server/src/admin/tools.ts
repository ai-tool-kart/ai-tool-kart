/*
 * Catalogue administration over the Postgres `tools` table.
 *
 * ── What this does NOT change ─────────────────────────────────────────────
 * The public site is still served from the bundled JSON catalogue (container.ts
 * names createJsonToolCatalogue). Edits made here land in the database
 * catalogue only, and every detail view says whether the live record
 * differs, so nobody mistakes a saved edit for a published one. Nothing here
 * imports, re-imports or bulk-rewrites the catalogue, and nothing deletes a
 * tool: there is no delete.
 *
 * ── Edits ─────────────────────────────────────────────────────────────────
 * A PATCH names only the fields it changes (admin/schema.ts lists the
 * editable ones; identifiers, publication status and editorial metrics are
 * not among them). The merged record is validated as a whole by the same
 * ToolSchema the catalogue loader uses. The change is optimistic-concurrency
 * checked against the updatedAt the editor loaded (stale → 409), applied
 * under a row lock, and audited (TOOL_UPDATED, with before/after per field)
 * in the same transaction.
 */

import { isToolId, TOOL_NOT_FOUND_MESSAGE, type Actor } from '../auth/ownership.ts'
import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import { ToolSchema } from '../catalogue/schema.ts'
import type { Database } from '../db/client.ts'
import { rowToTool, toolsEqual } from '../db/legacy/mapping.ts'
import { conflict, duplicateUrl, notFound, validationFailed } from '../domain/errors.ts'
import type { Tool } from '../domain/types.ts'
import type { Prisma, Tool as ToolRow, ToolSource, ToolStatus } from '../generated/prisma/client.ts'
import { normalizeUrl } from '../utils/normalizeUrl.ts'
import { recordAdminAction, type AuditEntryView } from './audit.ts'
import type { Paged } from './moderation.ts'
import { fieldsFromZod, parseBody } from './parse.ts'
import { ToolPatchSchema, type ToolChanges } from './schema.ts'

export interface AdminToolListItem {
  id: string
  slug: string
  name: string
  cat: string
  model: string
  pricingTier: string
  status: ToolStatus
  source: ToolSource
  verified: boolean
  url: string
  ownerCount: number
  /** How many catalogue rules the stored record breaks. 0 for a healthy record. */
  issueCount: number
  updatedAt: string
}

export interface AdminToolDetail {
  tool: Tool
  meta: { source: ToolSource; createdAt: string; updatedAt: string }
  owners: { userId: string; email: string; name: string | null; role: string; ownerSince: string; grantedBy: string | null }[]
  submissions: { id: string; name: string; status: string; submittedAt: string }[]
  /** "path: message" for every catalogue rule the stored record breaks. */
  issues: string[]
  /** Other tools whose name matches case-insensitively — candidates for a duplicate, never auto-merged. */
  possibleDuplicates: { id: string; name: string; url: string }[]
  /** The record the public site serves today, compared with this one. */
  liveCatalogue: { present: boolean; matchesDatabase: boolean }
  history: AuditEntryView[]
}

export interface ToolListQuery {
  page: number
  pageSize: number
  q?: string | undefined
  status?: ToolStatus[] | undefined
  category?: string | undefined
  source?: ToolSource[] | undefined
}

export interface ToolAdminService {
  list(query: ToolListQuery): Promise<Paged<AdminToolListItem>>
  get(toolId: string): Promise<AdminToolDetail>
  update(toolId: string, rawBody: unknown, context: { actor: Actor; requestId?: string | undefined }): Promise<AdminToolDetail>
}

function issuesOf(tool: Tool): string[] {
  const parsed = ToolSchema.safeParse(tool)
  if (parsed.success) return []
  return Object.entries(fieldsFromZod(parsed.error)).map(([path, message]) => `${path}: ${message}`)
}

/** Applies a PATCH to a record. `null` plainLine and `false` isMcpServer mean "absent", as in the JSON. */
function merge(tool: Tool, changes: ToolChanges): Tool {
  const { plainLine, isMcpServer, ...rest } = changes
  const merged: Tool = { ...tool, ...(rest as Partial<Tool>) }
  if (plainLine !== undefined) {
    if (plainLine === null || plainLine.trim() === '') delete merged.plainLine
    else merged.plainLine = plainLine
  }
  if (isMcpServer !== undefined) {
    if (isMcpServer) merged.isMcpServer = true
    else delete merged.isMcpServer
  }
  return merged
}

const EDITABLE: readonly (keyof ToolChanges)[] = [
  'name', 'mono', 'tagline', 'plainLine', 'summary', 'url', 'cat', 'model', 'pricingTier', 'price',
  'tags', 'roles', 'useCases', 'stages', 'verified', 'isMcpServer', 'api', 'ctx', 'team', 'trial', 'integr',
]

function valueOf(tool: Tool, field: keyof ToolChanges): unknown {
  if (field === 'plainLine') return tool.plainLine ?? null
  if (field === 'isMcpServer') return tool.isMcpServer === true
  return tool[field as keyof Tool]
}

export function createToolAdminService({ db, catalogue }: { db: Database; catalogue: ToolCatalogueRepository }): ToolAdminService {
  async function get(toolId: string): Promise<AdminToolDetail> {
    if (!isToolId(toolId)) throw notFound(TOOL_NOT_FOUND_MESSAGE)
    const row = await db.tool.findUnique({
      where: { id: toolId },
      include: {
        owners: { include: { user: { select: { email: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } },
        submissions: { select: { id: true, name: true, status: true, submittedAt: true }, orderBy: { submittedAt: 'desc' }, take: 20 },
      },
    })
    if (!row) throw notFound(TOOL_NOT_FOUND_MESSAGE)
    const tool = rowToTool(row)

    const [duplicates, live, history] = await Promise.all([
      db.tool.findMany({
        where: { id: { not: row.id }, name: { equals: row.name, mode: 'insensitive' } },
        select: { id: true, name: true, url: true },
        take: 10,
      }),
      catalogue.findById(row.id),
      db.adminAuditEvent.findMany({
        where: { targetToolId: row.id },
        include: { actor: { select: { id: true, email: true, name: true } }, targetUser: { select: { id: true, email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    ])

    return {
      tool,
      meta: { source: row.source, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
      owners: row.owners.map((owner) => ({
        userId: owner.userId,
        email: owner.user.email,
        name: owner.user.name,
        role: owner.user.role,
        ownerSince: owner.createdAt.toISOString(),
        grantedBy: owner.grantedByUserId,
      })),
      submissions: row.submissions.map((submission) => ({ ...submission, submittedAt: submission.submittedAt.toISOString() })),
      issues: issuesOf(tool),
      possibleDuplicates: duplicates,
      liveCatalogue: { present: live !== undefined, matchesDatabase: live !== undefined && toolsEqual(live, tool) },
      history: history.map((event) => ({
        id: event.id,
        kind: 'admin',
        type: event.action,
        actorType: 'ADMIN',
        actor: event.actor,
        submission: null,
        tool: { id: row.id, name: row.name },
        targetUser: event.targetUser,
        fromStatus: null,
        toStatus: null,
        metadata: typeof event.metadata === 'object' && event.metadata !== null ? (event.metadata as Record<string, unknown>) : {},
        createdAt: event.createdAt.toISOString(),
      })),
    }
  }

  return {
    async list({ page, pageSize, q, status, category, source }) {
      const where: Prisma.ToolWhereInput = {
        ...(status && status.length > 0 ? { status: { in: status } } : {}),
        ...(source && source.length > 0 ? { source: { in: source } } : {}),
        ...(category ? { cat: category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { id: { contains: q, mode: 'insensitive' } },
                { url: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      }
      const [rows, total] = await Promise.all([
        db.tool.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { _count: { select: { owners: true } } },
        }),
        db.tool.count({ where }),
      ])
      return {
        items: rows.map((row: ToolRow & { _count: { owners: number } }) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          cat: row.cat,
          model: row.model,
          pricingTier: row.pricingTier,
          status: row.status,
          source: row.source,
          verified: row.verified,
          url: row.url,
          ownerCount: row._count.owners,
          issueCount: issuesOf(rowToTool(row)).length,
          updatedAt: row.updatedAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      }
    },

    get,

    async update(toolId, rawBody, { actor, requestId }) {
      const { expectedUpdatedAt, changes } = parseBody(ToolPatchSchema, rawBody, 'Some fields need attention.')
      if (!isToolId(toolId)) throw notFound(TOOL_NOT_FOUND_MESSAGE)

      await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM tools WHERE id = ${toolId} FOR UPDATE`
        if (locked.length === 0) throw notFound(TOOL_NOT_FOUND_MESSAGE)
        const row = await tx.tool.findUniqueOrThrow({ where: { id: toolId } })
        if (row.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
          throw conflict('Someone saved this tool after you opened it. Reload to see their changes, then edit again.')
        }

        const before = rowToTool(row)
        const parsed = ToolSchema.safeParse(merge(before, changes))
        if (!parsed.success) throw validationFailed('Some fields need attention.', fieldsFromZod(parsed.error))
        // The schema's output: strings trimmed exactly as the loader would.
        const after = parsed.data as Tool

        const changed = EDITABLE.filter((field) => JSON.stringify(valueOf(before, field)) !== JSON.stringify(valueOf(after, field)))
        if (changed.length === 0) return

        const data: Prisma.ToolUpdateInput = {}
        for (const field of changed) (data as Record<string, unknown>)[field] = valueOf(after, field)
        if (changed.includes('url')) {
          const normalizedUrl = normalizeUrl(after.url)
          const clash =
            (await tx.tool.findFirst({ where: { normalizedUrl, id: { not: toolId } }, select: { id: true } })) ??
            (await catalogue.findByNormalizedUrl(normalizedUrl).then((tool) => (tool && tool.id !== toolId ? tool : null)))
          if (clash) throw duplicateUrl(`Another tool ("${clash.id}") already uses this address.`, { field: 'url' })
          data.normalizedUrl = normalizedUrl
        }

        await tx.tool.update({ where: { id: toolId }, data })
        await recordAdminAction(tx, {
          actorUserId: actor.id,
          action: 'TOOL_UPDATED',
          targetToolId: toolId,
          metadata: {
            changes: Object.fromEntries(changed.map((field) => [field, { from: valueOf(before, field), to: valueOf(after, field) }])),
          },
          requestId,
        })
      })
      return get(toolId)
    },
  }
}
