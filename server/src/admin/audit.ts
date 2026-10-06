/*
 * The administrative audit trail — writing it, and reading it back.
 *
 * Two append-only tables, one timeline:
 *   submission_events   everything that happened to one submission
 *                       (created, approved, rejected, changes requested, notes)
 *   admin_audit_events  administrative actions that are not about one
 *                       submission (tool edits, ownership, role changes)
 *
 * Both reject UPDATE, DELETE and TRUNCATE in the database itself. Nothing
 * here (or anywhere) offers to edit or remove an entry: a correction is a
 * new event.
 *
 * recordAdminAction() takes a TRANSACTION client on purpose. The audit row
 * is written in the same transaction as the change it describes, so the two
 * commit or roll back together: there is no window where a change exists
 * without its record, or a record without its change.
 */

import { ADMIN } from '../config/limits.ts'
import type { Database } from '../db/client.ts'
import { Prisma, type AdminAction } from '../generated/prisma/client.ts'

type Tx = Prisma.TransactionClient

export interface AdminActionInput {
  actorUserId: string
  action: AdminAction
  targetToolId?: string | null
  targetUserId?: string | null
  metadata?: Record<string, unknown>
  requestId?: string | undefined
}

export async function recordAdminAction(tx: Tx, input: AdminActionInput): Promise<void> {
  await tx.adminAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetToolId: input.targetToolId ?? null,
      targetUserId: input.targetUserId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonObject,
      requestId: input.requestId ?? null,
    },
  })
}

/** Who did something, as an admin may see it. Never a hash, never a session. */
export interface ActorView {
  id: string
  email: string
  name: string | null
}

/** One row of the merged timeline. */
export interface AuditEntryView {
  id: string
  kind: 'submission' | 'admin'
  /** submission_event_type or admin_action. */
  type: string
  actorType: 'OWNER' | 'ADMIN' | 'SYSTEM'
  /** Null for SYSTEM events. */
  actor: ActorView | null
  submission: { id: string; name: string } | null
  tool: { id: string; name: string } | null
  targetUser: { id: string; email: string } | null
  fromStatus: string | null
  toStatus: string | null
  /** Reasons, notes, field changes. Admin-only: this endpoint is behind requireRole('ADMIN'). */
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AuditPage {
  items: AuditEntryView[]
  total: number
  page: number
  pageSize: number
}

export type AuditKind = 'all' | 'submission' | 'admin'

interface AuditRow {
  id: string
  kind: 'submission' | 'admin'
  type: string
  actor_type: 'OWNER' | 'ADMIN' | 'SYSTEM'
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  submission_id: string | null
  submission_name: string | null
  tool_id: string | null
  tool_name: string | null
  target_user_id: string | null
  target_user_email: string | null
  from_status: string | null
  to_status: string | null
  metadata: unknown
  created_at: Date
}

// Column lists are fixed SQL; every VALUE goes through Prisma.sql parameters.
const SUBMISSION_BRANCH = Prisma.sql`
  SELECT e.id::text AS id, 'submission' AS kind, e.event_type::text AS type, e.actor_type::text AS actor_type,
         u.id::text AS actor_id, u.email AS actor_email, u.name AS actor_name,
         s.id::text AS submission_id, s.name AS submission_name,
         s.tool_id AS tool_id, t.name AS tool_name,
         NULL::text AS target_user_id, NULL::text AS target_user_email,
         e.from_status::text AS from_status, e.to_status::text AS to_status,
         e.metadata AS metadata, e.created_at AS created_at
    FROM submission_events e
    JOIN submissions s ON s.id = e.submission_id
    LEFT JOIN users u ON u.id = e.actor_user_id
    LEFT JOIN tools t ON t.id = s.tool_id`

const ADMIN_BRANCH = Prisma.sql`
  SELECT a.id::text AS id, 'admin' AS kind, a.action::text AS type, 'ADMIN' AS actor_type,
         u.id::text AS actor_id, u.email AS actor_email, u.name AS actor_name,
         NULL::text AS submission_id, NULL::text AS submission_name,
         a.target_tool_id AS tool_id, t.name AS tool_name,
         tu.id::text AS target_user_id, tu.email AS target_user_email,
         NULL::text AS from_status, NULL::text AS to_status,
         a.metadata AS metadata, a.created_at AS created_at
    FROM admin_audit_events a
    JOIN users u ON u.id = a.actor_user_id
    LEFT JOIN tools t ON t.id = a.target_tool_id
    LEFT JOIN users tu ON tu.id = a.target_user_id`

function toEntry(row: AuditRow): AuditEntryView {
  return {
    id: row.id,
    kind: row.kind,
    type: row.type,
    actorType: row.actor_type,
    actor: row.actor_id && row.actor_email ? { id: row.actor_id, email: row.actor_email, name: row.actor_name } : null,
    submission: row.submission_id ? { id: row.submission_id, name: row.submission_name ?? '' } : null,
    tool: row.tool_id ? { id: row.tool_id, name: row.tool_name ?? row.tool_id } : null,
    targetUser: row.target_user_id && row.target_user_email ? { id: row.target_user_id, email: row.target_user_email } : null,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    metadata: typeof row.metadata === 'object' && row.metadata !== null ? (row.metadata as Record<string, unknown>) : {},
    createdAt: row.created_at.toISOString(),
  }
}

export interface AuditService {
  list(query: { page: number; pageSize: number; kind: AuditKind }): Promise<AuditPage>
  /** The newest moderation and admin actions: SYSTEM and OWNER events are left out. */
  recentAdminActivity(limit?: number): Promise<AuditEntryView[]>
}

export function createAuditService({ db }: { db: Database }): AuditService {
  async function count(kind: AuditKind): Promise<number> {
    const [submissionCount, adminCount] = await Promise.all([
      kind === 'admin' ? 0 : db.submissionEvent.count(),
      kind === 'submission' ? 0 : db.adminAuditEvent.count(),
    ])
    return submissionCount + adminCount
  }

  function branches(kind: AuditKind, adminOnly: boolean): Prisma.Sql {
    const submission = adminOnly ? Prisma.sql`${SUBMISSION_BRANCH} WHERE e.actor_type = 'ADMIN'` : SUBMISSION_BRANCH
    if (kind === 'submission') return submission
    if (kind === 'admin') return ADMIN_BRANCH
    return Prisma.sql`${submission} UNION ALL ${ADMIN_BRANCH}`
  }

  async function query(kind: AuditKind, limit: number, offset: number, adminOnly = false): Promise<AuditEntryView[]> {
    const rows = await db.$queryRaw<AuditRow[]>`
      SELECT * FROM (${branches(kind, adminOnly)}) AS timeline
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}`
    return rows.map(toEntry)
  }

  return {
    async list({ page, pageSize, kind }) {
      const [items, total] = await Promise.all([query(kind, pageSize, (page - 1) * pageSize), count(kind)])
      return { items, total, page, pageSize }
    },

    async recentAdminActivity(limit = ADMIN.recentActivityLimit) {
      return query('all', limit, 0, true)
    },
  }
}
