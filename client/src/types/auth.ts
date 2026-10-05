/*
 * Account types — mirrors of the server's public shapes (server/src/auth/
 * roles.ts PublicUser, server/src/submissions/ownerView.ts).
 *
 * There is deliberately no token type: the session lives in an HttpOnly
 * cookie the browser owns. The only identity the client ever holds is
 * the PublicUser the server returned.
 */

export type UserRole = 'USER' | 'TOOL_OWNER' | 'ADMIN' | 'SUPER_ADMIN'

export interface PublicUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  emailVerified: boolean
  createdAt: string
}

/**
 *   loading        /auth/me has not answered yet
 *   anonymous      no session
 *   authenticated  a live session; `user` is the server's answer
 *   unavailable    the server has no accounts (no database) — the site and
 *                  the anonymous Submit flow work exactly as before
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: PublicUser }
  | { status: 'unavailable' }

export type SubmissionStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'UNPUBLISHED'
  | 'ARCHIVED'

/** What a submitter may see of their own submission. */
export interface OwnerSubmission {
  id: string
  status: SubmissionStatus
  revision: number
  toolId: string | null
  siteUrl: string
  name: string
  tagline: string
  category: string
  plan: 'free' | 'featured'
  launchWeekId: string
  ownerMessage: string | null
  rejectionReason: string | null
  submittedAt: string
  reviewedAt: string | null
  publishedAt: string | null
  updatedAt: string
}
