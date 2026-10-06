import type { AuditEntry } from '@/types/admin'
import type { SubmissionStatus, UserRole } from '@/types/auth'
import type { HeadTags } from '@/utils/guideSeo'

/*
 * How admin records read. One table per vocabulary so the dashboard, the
 * audit log and the detail pages can never describe the same event two ways.
 * Moderators see the server's real status names — these are labels, not a
 * second state model.
 */

export const ADMIN_STATUS_LABEL: Record<SubmissionStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
  ARCHIVED: 'Archived',
}

export const SUBMISSION_STATUSES = Object.keys(ADMIN_STATUS_LABEL) as SubmissionStatus[]

export const ROLE_LABEL: Record<UserRole, string> = {
  USER: 'User',
  TOOL_OWNER: 'Tool owner',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super admin',
}

export const EVENT_LABEL: Record<string, string> = {
  SUBMISSION_CREATED: 'Submitted',
  LEGACY_IMPORTED: 'Imported from the legacy store',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes requested',
  NOTE_ADDED: 'Internal note',
  TOOL_UPDATED: 'Tool edited',
  TOOL_OWNER_GRANTED: 'Ownership granted',
  TOOL_OWNER_REVOKED: 'Ownership removed',
  USER_ROLE_CHANGED: 'Role changed',
}

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** The human-readable detail of an audit entry: the reason, the note, the fields changed. */
export function auditDetail(entry: Pick<AuditEntry, 'type' | 'metadata'>): string | undefined {
  const { metadata } = entry
  switch (entry.type) {
    case 'REJECTED':
      return text(metadata.reason)
    case 'CHANGES_REQUESTED':
      return text(metadata.message)
    case 'NOTE_ADDED':
      return text(metadata.note)
    case 'APPROVED':
      return text(metadata.toolId) ? `Created draft tool “${metadata.toolId as string}”.` : undefined
    case 'USER_ROLE_CHANGED':
      return `${ROLE_LABEL[metadata.from as UserRole] ?? String(metadata.from)} → ${ROLE_LABEL[metadata.to as UserRole] ?? String(metadata.to)}`
    case 'TOOL_UPDATED': {
      const changes = metadata.changes
      return changes && typeof changes === 'object' ? `Changed ${Object.keys(changes).join(', ')}.` : undefined
    }
    case 'TOOL_OWNER_GRANTED':
      return metadata.via === 'approval' ? 'Granted on approval.' : undefined
    default:
      return undefined
  }
}

/** Admin pages are private: a title, and never indexed. */
export function adminHead(title: string): HeadTags {
  const full = `${title} — AI Tool Kart admin`
  const description = 'AI Tool Kart administration.'
  return { title: full, description, robots: 'noindex, nofollow', og: { type: 'website', title: full, description } }
}
