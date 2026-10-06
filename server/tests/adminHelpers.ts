/*
 * Fixtures for the Phase 6 admin tests: submissions complete enough to be
 * approved into a valid catalogue record, and the approval body an admin
 * form would send.
 */

import { randomUUID } from 'node:crypto'
import type { Database } from '../src/db/client.ts'
import type { Submission, SubmissionStatus } from '../src/generated/prisma/client.ts'
import { normalizeUrl } from '../src/utils/normalizeUrl.ts'
import { readJson } from './helpers.ts'

export interface ReviewableOptions {
  id?: string
  userId?: string | null
  name?: string
  url?: string
  status?: SubmissionStatus
  submittedAt?: Date
}

export async function insertReviewable(db: Database, options: ReviewableOptions = {}): Promise<Submission> {
  const id = options.id ?? randomUUID()
  const url = options.url ?? `https://${id.slice(0, 8)}.example.org`
  const userId = options.userId === undefined ? null : options.userId
  return db.submission.create({
    data: {
      id,
      userId,
      source: userId ? 'form' : 'legacy_json',
      status: options.status ?? 'SUBMITTED',
      siteUrl: url,
      normalizedUrl: normalizeUrl(url),
      name: options.name ?? 'Reviewable Tool',
      tagline: 'Writes first drafts from your notes.',
      description:
        'Reviewable Tool turns rough notes into a structured first draft. It keeps your voice, ' +
        'suggests headings, and exports to the editors you already use.',
      category: 'Writing',
      pricingModel: 'Free',
      price: 'Free',
      tags: ['Writing', 'Drafting'],
      audience: 'Writers and content teams',
      alternatives: [],
      launchWeekId: '2026-11-16',
      ...(options.submittedAt ? { submittedAt: options.submittedAt } : {}),
    },
  })
}

/** A complete, valid approval body. */
export function approvalBody(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    tool: {
      slug,
      mono: 'Rt',
      price: 'Free',
      pop: 30,
      roles: ['Writer'],
      stages: ['draft'],
      useCases: ['Draft an article'],
      tags: ['Writing'],
      summary: 'Turns rough notes into a structured first draft, keeping your voice and exporting to common editors.',
      ...overrides,
    },
  }
}

export interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string>; details?: Record<string, unknown> }
}

export async function errorOf(response: Response): Promise<{ status: number; body: ErrorBody }> {
  return { status: response.status, body: await readJson<ErrorBody>(response) }
}

/** Every string an admin response must never contain. */
export const SECRET_MARKERS = ['passwordHash', 'password_hash', 'tokenHash', 'token_hash', 'scrypt$', 'atk_session']

export function assertNoSecrets(text: string): void {
  for (const marker of SECRET_MARKERS) {
    if (text.includes(marker)) throw new Error(`response leaked "${marker}"`)
  }
}
