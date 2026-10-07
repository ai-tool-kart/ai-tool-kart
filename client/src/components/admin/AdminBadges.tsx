import type { ReactNode } from 'react'
import { TONE_CLASSES, TONE_DOT, type Tone } from '@/components/admin/adminTheme'
import type { SubmissionStatus, UserRole } from '@/types/auth'
import { ADMIN_STATUS_LABEL, eventLabel, ROLE_LABEL } from '@/utils/adminFormat'

/*
 * Badges for the admin console: a bordered monospace chip with a status dot.
 * Restrained on purpose — colour carries the state, nothing else shouts.
 */

const STATUS_TONE: Record<SubmissionStatus, Tone> = {
  SUBMITTED: 'info',
  UNDER_REVIEW: 'accent',
  CHANGES_REQUESTED: 'warn',
  APPROVED: 'ok',
  PUBLISHED: 'ok',
  REJECTED: 'danger',
  UNPUBLISHED: 'neutral',
  ARCHIVED: 'neutral',
}

const ROLE_TONE: Record<UserRole, Tone> = {
  USER: 'neutral',
  TOOL_OWNER: 'info',
  ADMIN: 'accent',
  SUPER_ADMIN: 'warn',
}

const ACTION_TONE: Record<string, Tone> = {
  SUBMISSION_CREATED: 'info',
  LEGACY_IMPORTED: 'neutral',
  APPROVED: 'ok',
  REJECTED: 'danger',
  CHANGES_REQUESTED: 'warn',
  NOTE_ADDED: 'neutral',
  TOOL_UPDATED: 'accent',
  TOOL_OWNER_GRANTED: 'info',
  TOOL_OWNER_REVOKED: 'info',
  USER_ROLE_CHANGED: 'warn',
}

export function Chip({ tone = 'neutral', dot = true, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[4px] border px-[7px] py-[3px] font-mono text-[10.5px] leading-none font-medium tracking-[0.06em] whitespace-nowrap uppercase ${TONE_CLASSES[tone]}`}
    >
      {dot && <span aria-hidden="true" className={`h-[5px] w-[5px] rounded-full ${TONE_DOT[tone]}`} />}
      {children}
    </span>
  )
}

export default function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <Chip tone={STATUS_TONE[status] ?? 'neutral'}>{ADMIN_STATUS_LABEL[status] ?? status}</Chip>
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <Chip tone={ROLE_TONE[role] ?? 'neutral'}>{ROLE_LABEL[role] ?? role}</Chip>
}

export function ActionBadge({ type }: { type: string }) {
  return <Chip tone={ACTION_TONE[type] ?? 'neutral'}>{eventLabel(type)}</Chip>
}
