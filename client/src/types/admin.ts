/*
 * Admin API types — mirrors of the server's admin views (server/src/admin/,
 * server/src/auth/users.ts). Nothing here carries a token, a hash or a
 * session: the server's allowlists never send them.
 */

import type { SubmissionStatus, UserRole } from '@/types/auth'

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ActorRef {
  id: string
  email: string
  name: string | null
}

export type ModerationAction = 'approve' | 'reject' | 'requestChanges' | 'note'

export interface AdminSubmissionListItem {
  id: string
  status: SubmissionStatus
  revision: number
  source: 'form' | 'legacy_json'
  name: string
  siteUrl: string
  category: string
  plan: 'free' | 'featured'
  submitter: ActorRef | null
  submittedAt: string
  updatedAt: string
  reviewedAt: string | null
}

export interface SubmissionEvent {
  id: string
  type: string
  actorType: 'OWNER' | 'ADMIN' | 'SYSTEM'
  actor: ActorRef | null
  fromStatus: SubmissionStatus | null
  toStatus: SubmissionStatus | null
  metadata: Record<string, unknown>
  createdAt: string
}

/** The fields an approval confirms — server/src/review/buildTool.ts ReviewedFields. */
export interface ApprovalFields {
  slug: string
  mono: string
  price: string
  pop: number
  roles: string[]
  stages: string[]
  useCases: string[]
  tags: string[]
  summary: string
}

export interface AdminSubmissionDetail extends AdminSubmissionListItem {
  toolId: string | null
  normalizedUrl: string
  tagline: string
  description: string
  pricingModel: string
  price: string | null
  tags: string[]
  audience: string | null
  alternatives: string[]
  faqs: unknown
  launchStory: string | null
  launchWeekId: string
  ownerMessage: string | null
  rejectionReason: string | null
  publishedAt: string | null
  submitter: (ActorRef & { role: UserRole; createdAt: string }) | null
  reviewer: ActorRef | null
  tool: { id: string; name: string; slug: string; status: string } | null
  events: SubmissionEvent[]
  allowedActions: ModerationAction[]
  proposal: ApprovalFields | null
  duplicates: {
    catalogueTool: { id: string; name: string; location: 'database' | 'live-catalogue' } | null
    otherSubmissions: { id: string; name: string; status: SubmissionStatus }[]
  }
}

export interface AdminToolListItem {
  id: string
  slug: string
  name: string
  cat: string
  model: string
  pricingTier: string
  status: 'active' | 'draft'
  source: 'seed' | 'submission'
  verified: boolean
  url: string
  ownerCount: number
  issueCount: number
  updatedAt: string
}

/** A catalogue record as the server stores it (server/src/domain/types.ts Tool). */
export interface CatalogueRecord {
  id: string
  slug: string
  name: string
  mono: string
  cat: string
  model: string
  tagline: string
  plainLine?: string
  rating: number
  reviews: number
  price: string
  trend: string
  badge: string
  tags: string[]
  pop: number
  isMcpServer?: boolean
  api: string
  ctx: string
  team: string
  trial: string
  integr: string
  url: string
  summary: string
  roles: string[]
  useCases: string[]
  stages: string[]
  pricingTier: string
  status: 'active' | 'draft'
  verified: boolean
  addedAt?: string
}

export interface AuditEntry {
  id: string
  kind: 'submission' | 'admin'
  type: string
  actorType: 'OWNER' | 'ADMIN' | 'SYSTEM'
  actor: ActorRef | null
  submission: { id: string; name: string } | null
  tool: { id: string; name: string } | null
  targetUser: { id: string; email: string } | null
  fromStatus: string | null
  toStatus: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AdminToolDetail {
  tool: CatalogueRecord
  meta: { source: 'seed' | 'submission'; createdAt: string; updatedAt: string }
  owners: { userId: string; email: string; name: string | null; role: UserRole; ownerSince: string; grantedBy: string | null }[]
  submissions: { id: string; name: string; status: SubmissionStatus; submittedAt: string }[]
  issues: string[]
  possibleDuplicates: { id: string; name: string; url: string }[]
  liveCatalogue: { present: boolean; matchesDatabase: boolean }
  history: AuditEntry[]
}

export interface AdminUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  emailVerified: boolean
  disabled: boolean
  createdAt: string
  lastLoginAt: string | null
  submissionCount: number
  ownedToolCount: number
}

export interface AdminUserDetail {
  user: AdminUser
  ownedTools: { id: string; name: string; ownerSince: string }[]
  submissions: { id: string; name: string; status: SubmissionStatus; submittedAt: string }[]
  history: AuditEntry[]
  assignableRoles: UserRole[]
}

export interface AdminStats {
  generatedAt: string
  catalogue: { databaseTotal: number; byStatus: Record<'active' | 'draft', number>; fromSubmissions: number; liveActive: number }
  submissions: {
    total: number
    byStatus: Record<SubmissionStatus, number>
    awaitingReview: number
    changesRequested: number
    approved: number
    rejected: number
  }
  users: { total: number; byRole: Record<UserRole, number> }
  moderation: { decisions: number; windowDays: number }
  recentActivity: AuditEntry[]
}

export interface AdminVocabulary {
  categories: string[]
  pricingModels: string[]
  pricingTiers: string[]
  pricingModelsByTier: Record<string, string[]>
  roles: string[]
  stages: string[]
  useCases: string[]
  toolFields: {
    monoLength: number
    priceMaxChars: number
    summaryMinChars: number
    summaryMaxChars: number
    slugMaxChars: number
    tagMaxChars: number
    tagsMin: number
    tagsMax: number
    popMin: number
    popMax: number
  }
  moderation: { reasonMinChars: number; reasonMaxChars: number; noteMaxChars: number }
  assignableRoles: UserRole[]
}

/** The editable subset of a catalogue record (server/src/admin/schema.ts ToolPatchSchema). */
export type ToolChanges = Partial<
  Pick<
    CatalogueRecord,
    | 'name' | 'mono' | 'tagline' | 'summary' | 'url' | 'cat' | 'model' | 'pricingTier' | 'price' | 'tags' | 'roles'
    | 'useCases' | 'stages' | 'verified' | 'isMcpServer' | 'api' | 'ctx' | 'team' | 'trial' | 'integr'
  > & { plainLine: string | null }
>
