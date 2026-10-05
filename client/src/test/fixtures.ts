import type { OwnerSubmission, PublicUser } from '@/types/auth'

export const ADA: PublicUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'USER',
  emailVerified: false,
  createdAt: '2026-10-05T00:00:00.000Z',
}

export function ownerSubmission(overrides: Partial<OwnerSubmission> = {}): OwnerSubmission {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'SUBMITTED',
    revision: 1,
    toolId: null,
    siteUrl: 'https://example.com',
    name: 'Example Tool',
    tagline: 'Does example things.',
    category: 'Writing',
    plan: 'free',
    launchWeekId: '2026-11-16',
    ownerMessage: null,
    rejectionReason: null,
    submittedAt: '2026-10-05T10:00:00.000Z',
    reviewedAt: null,
    publishedAt: null,
    updatedAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  }
}
