import type { SubmissionStatus } from '@/types/auth'
import type { HeadTags } from '@/utils/guideSeo'

/*
 * How a submission's server status reads to the person who submitted it.
 * One table, so the list and the status page can never describe the same
 * state two ways.
 */

export interface StatusCopy {
  label: string
  /** What it means for the submitter, in a sentence. */
  detail: string
}

export const SUBMISSION_STATUS_COPY: Record<SubmissionStatus, StatusCopy> = {
  SUBMITTED: { label: 'Submitted', detail: 'Received and waiting for review. Nothing for you to do yet.' },
  UNDER_REVIEW: { label: 'In review', detail: 'Our team is reviewing your listing.' },
  CHANGES_REQUESTED: { label: 'Changes requested', detail: 'The reviewer asked for a few changes before it can go live.' },
  APPROVED: { label: 'Approved', detail: 'Approved and getting ready to publish.' },
  REJECTED: { label: 'Not accepted', detail: 'This submission was not accepted for the catalogue.' },
  PUBLISHED: { label: 'Live', detail: 'Your tool is listed on AI Tool Kart.' },
  UNPUBLISHED: { label: 'Unpublished', detail: 'Your listing is currently not visible in the catalogue.' },
  ARCHIVED: { label: 'Archived', detail: 'This submission has been archived.' },
}

/** Only same-site paths survive, so ?next= can never become an open redirect. */
export function safeNextPath(raw: string | null | undefined, fallback = '/account/submissions'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback
  return raw
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Head tags for an account page (useDocumentMeta): a title, and noindex —
 * sign-in and personal submission pages are never for search engines.
 */
export function accountHead(title: string, description: string): HeadTags {
  const full = `${title} — AI Tool Kart`
  return { title: full, description, robots: 'noindex, nofollow', og: { type: 'website', title: full, description } }
}
