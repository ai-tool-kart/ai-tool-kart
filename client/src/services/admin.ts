import { apiRequest } from '@/services/http'
import type {
  AdminStats,
  AdminSubmissionDetail,
  AdminSubmissionListItem,
  AdminToolDetail,
  AdminToolListItem,
  AdminUser,
  AdminUserDetail,
  AdminVocabulary,
  ApprovalFields,
  AuditEntry,
  Paged,
  ToolChanges,
} from '@/types/admin'
import type { PublicUser, UserRole } from '@/types/auth'

/*
 * Admin transport — /api/admin/*. One function per endpoint, no state.
 *
 * Every call goes through apiRequest, so it is same-origin with the HttpOnly
 * session cookie and nothing else: no token, no user id for "who is
 * asking". Ids in a path name the RECORD being asked about; the server
 * decides whether this session may see or change it, every time.
 */

type Query = Record<string, string | number | string[] | undefined>

function withQuery(path: string, query: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','))
    } else params.set(key, String(value))
  }
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

const id = encodeURIComponent

export function fetchAdminStats(signal?: AbortSignal): Promise<AdminStats> {
  return apiRequest<AdminStats>('/admin/stats', { signal })
}

export function fetchAdminVocabulary(signal?: AbortSignal): Promise<AdminVocabulary> {
  return apiRequest<AdminVocabulary>('/admin/vocabulary', { signal })
}

/* ── Moderation ──────────────────────────────────────────────────────────── */

export interface SubmissionQuery {
  page?: number
  pageSize?: number
  q?: string
  status?: string[]
  sort?: 'submitted' | 'updated'
  order?: 'asc' | 'desc'
}

export function fetchAdminSubmissions(query: SubmissionQuery, signal?: AbortSignal): Promise<Paged<AdminSubmissionListItem>> {
  return apiRequest(withQuery('/admin/submissions', { ...query }), { signal })
}

export async function fetchAdminSubmission(submissionId: string, signal?: AbortSignal): Promise<AdminSubmissionDetail> {
  return (await apiRequest<{ submission: AdminSubmissionDetail }>(`/admin/submissions/${id(submissionId)}`, { signal })).submission
}

async function decide(submissionId: string, action: string, body: unknown): Promise<AdminSubmissionDetail> {
  return (await apiRequest<{ submission: AdminSubmissionDetail }>(`/admin/submissions/${id(submissionId)}/${action}`, { body })).submission
}

export const approveSubmission = (submissionId: string, tool: ApprovalFields) => decide(submissionId, 'approve', { tool })
export const rejectSubmission = (submissionId: string, reason: string) => decide(submissionId, 'reject', { reason })
export const requestSubmissionChanges = (submissionId: string, message: string) =>
  decide(submissionId, 'request-changes', { message })
export const addSubmissionNote = (submissionId: string, note: string) => decide(submissionId, 'notes', { note })

/* ── Catalogue ───────────────────────────────────────────────────────────── */

export interface ToolQuery {
  page?: number
  pageSize?: number
  q?: string
  status?: string[]
  category?: string
  source?: string[]
}

export function fetchAdminTools(query: ToolQuery, signal?: AbortSignal): Promise<Paged<AdminToolListItem>> {
  return apiRequest(withQuery('/admin/tools', { ...query }), { signal })
}

export function fetchAdminTool(toolId: string, signal?: AbortSignal): Promise<AdminToolDetail> {
  return apiRequest(`/admin/tools/${id(toolId)}`, { signal })
}

export function updateAdminTool(toolId: string, expectedUpdatedAt: string, changes: ToolChanges): Promise<AdminToolDetail> {
  return apiRequest(`/admin/tools/${id(toolId)}`, { method: 'PATCH', body: { expectedUpdatedAt, changes } })
}

export function grantToolOwnership(toolId: string, userId: string): Promise<{ role: UserRole }> {
  return apiRequest(`/admin/tools/${id(toolId)}/owners/${id(userId)}`, { method: 'PUT' })
}

export function revokeToolOwnership(toolId: string, userId: string): Promise<{ removed: boolean; role: UserRole }> {
  return apiRequest(`/admin/tools/${id(toolId)}/owners/${id(userId)}`, { method: 'DELETE' })
}

/* ── Users ───────────────────────────────────────────────────────────────── */

export interface UserQuery {
  page?: number
  pageSize?: number
  q?: string
  role?: string[]
}

export function fetchAdminUsers(query: UserQuery, signal?: AbortSignal): Promise<Paged<AdminUser>> {
  return apiRequest(withQuery('/admin/users', { ...query }), { signal })
}

export function fetchAdminUser(userId: string, signal?: AbortSignal): Promise<AdminUserDetail> {
  return apiRequest(`/admin/users/${id(userId)}`, { signal })
}

export async function setUserRole(userId: string, role: UserRole): Promise<PublicUser> {
  return (await apiRequest<{ user: PublicUser }>(`/admin/users/${id(userId)}/role`, { method: 'PATCH', body: { role } })).user
}

/* ── Audit ───────────────────────────────────────────────────────────────── */

export interface AuditQuery {
  page?: number
  pageSize?: number
  kind?: 'all' | 'submission' | 'admin'
}

export function fetchAuditLog(query: AuditQuery, signal?: AbortSignal): Promise<Paged<AuditEntry>> {
  return apiRequest(withQuery('/admin/audit', { ...query }), { signal })
}
