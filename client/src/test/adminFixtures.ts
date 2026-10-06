import type { AdminStats, AdminSubmissionDetail, AdminToolDetail, AdminUserDetail, AdminVocabulary, AuditEntry } from '@/types/admin'
import type { PublicUser } from '@/types/auth'
import { ADA } from '@/test/fixtures'

/* Admin API fixtures, shaped exactly like the server's admin views. */

export const GRACE_ADMIN: PublicUser = { ...ADA, id: '22222222-2222-4222-8222-222222222222', email: 'grace@example.com', name: 'Grace', role: 'ADMIN' }
export const ROOT_SUPER: PublicUser = { ...ADA, id: '33333333-3333-4333-8333-333333333333', email: 'root@example.com', name: 'Root', role: 'SUPER_ADMIN' }

export const SUBMISSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

export function auditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'e1',
    kind: 'submission',
    type: 'REJECTED',
    actorType: 'ADMIN',
    actor: { id: GRACE_ADMIN.id, email: GRACE_ADMIN.email, name: 'Grace' },
    submission: { id: SUBMISSION_ID, name: 'Example Tool' },
    tool: null,
    targetUser: null,
    fromStatus: 'SUBMITTED',
    toStatus: 'REJECTED',
    metadata: { reason: 'Not an AI tool.' },
    createdAt: '2026-10-06T10:00:00.000Z',
    ...overrides,
  }
}

export function adminStats(overrides: Partial<AdminStats> = {}): AdminStats {
  return {
    generatedAt: '2026-10-07T10:00:00.000Z',
    catalogue: { databaseTotal: 69, byStatus: { active: 68, draft: 1 }, fromSubmissions: 1, liveActive: 68 },
    submissions: {
      total: 9,
      byStatus: { SUBMITTED: 3, UNDER_REVIEW: 1, CHANGES_REQUESTED: 2, APPROVED: 1, REJECTED: 2, PUBLISHED: 0, UNPUBLISHED: 0, ARCHIVED: 0 },
      awaitingReview: 4,
      changesRequested: 2,
      approved: 1,
      rejected: 2,
    },
    users: { total: 12, byRole: { USER: 8, TOOL_OWNER: 2, ADMIN: 1, SUPER_ADMIN: 1 } },
    moderation: { decisions: 5, windowDays: 7 },
    recentActivity: [auditEntry()],
    ...overrides,
  }
}

export function submissionDetail(overrides: Partial<AdminSubmissionDetail> = {}): AdminSubmissionDetail {
  return {
    id: SUBMISSION_ID,
    status: 'SUBMITTED',
    revision: 1,
    source: 'form',
    name: 'Example Tool',
    siteUrl: 'https://example.com',
    category: 'Writing',
    plan: 'free',
    submitter: { id: ADA.id, email: ADA.email, name: 'Ada', role: 'USER', createdAt: ADA.createdAt },
    submittedAt: '2026-10-05T10:00:00.000Z',
    updatedAt: '2026-10-05T10:00:00.000Z',
    reviewedAt: null,
    toolId: null,
    normalizedUrl: 'example.com',
    tagline: 'Does example things.',
    description: 'A longer description of the example tool and what it does for writers.',
    pricingModel: 'Free',
    price: 'Free',
    tags: ['Writing'],
    audience: 'Writers',
    alternatives: [],
    faqs: [],
    launchStory: null,
    launchWeekId: '2026-11-16',
    ownerMessage: null,
    rejectionReason: null,
    publishedAt: null,
    reviewer: null,
    tool: null,
    events: [
      {
        id: 'ev1',
        type: 'SUBMISSION_CREATED',
        actorType: 'OWNER',
        actor: { id: ADA.id, email: ADA.email, name: 'Ada' },
        fromStatus: null,
        toStatus: 'SUBMITTED',
        metadata: {},
        createdAt: '2026-10-05T10:00:00.000Z',
      },
    ],
    allowedActions: ['approve', 'requestChanges', 'reject', 'note'],
    proposal: {
      slug: 'example-tool',
      mono: 'Ex',
      price: 'Free',
      pop: 30,
      roles: ['Writer'],
      stages: [],
      useCases: [],
      tags: ['Writing'],
      summary: 'A longer description of the example tool and what it does for writers.',
    },
    duplicates: { catalogueTool: null, otherSubmissions: [] },
    ...overrides,
  }
}

export const VOCABULARY: AdminVocabulary = {
  categories: ['Writing', 'Code'],
  pricingModels: ['Free', 'Freemium', 'Subscription'],
  pricingTiers: ['free', 'freemium', 'paid'],
  pricingModelsByTier: { free: ['Free'], freemium: ['Freemium'], paid: ['Subscription'] },
  roles: ['Writer', 'Developer'],
  stages: ['draft', 'research'],
  useCases: ['Draft an article'],
  toolFields: { monoLength: 2, priceMaxChars: 60, summaryMinChars: 40, summaryMaxChars: 600, slugMaxChars: 64, tagMaxChars: 40, tagsMin: 1, tagsMax: 12, popMin: 0, popMax: 100 },
  moderation: { reasonMinChars: 10, reasonMaxChars: 2000, noteMaxChars: 4000 },
  assignableRoles: ['USER', 'ADMIN', 'SUPER_ADMIN'],
}

export function toolDetail(overrides: Partial<AdminToolDetail> = {}): AdminToolDetail {
  return {
    tool: {
      id: 'alpha-writer',
      slug: 'alpha-writer',
      name: 'Alpha Writer',
      mono: 'Al',
      cat: 'Writing',
      model: 'Free',
      tagline: 'Writes things.',
      rating: 0,
      reviews: 0,
      price: 'Free',
      trend: '',
      badge: '',
      tags: ['Writing'],
      pop: 30,
      api: '—',
      ctx: '—',
      team: '—',
      trial: '—',
      integr: '—',
      url: 'https://alpha.example.com',
      summary: 'A valid catalogue summary that is comfortably longer than forty characters.',
      roles: ['Writer'],
      useCases: ['Draft an article'],
      stages: ['draft'],
      pricingTier: 'free',
      status: 'active',
      verified: false,
    },
    meta: { source: 'seed', createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' },
    owners: [],
    submissions: [],
    issues: [],
    possibleDuplicates: [],
    liveCatalogue: { present: true, matchesDatabase: true },
    history: [],
    ...overrides,
  }
}

export function userDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    user: {
      id: ADA.id,
      email: ADA.email,
      name: 'Ada',
      role: 'USER',
      emailVerified: false,
      disabled: false,
      createdAt: ADA.createdAt,
      lastLoginAt: null,
      submissionCount: 1,
      ownedToolCount: 0,
    },
    ownedTools: [],
    submissions: [],
    history: [],
    assignableRoles: [],
    ...overrides,
  }
}
