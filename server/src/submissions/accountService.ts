/*
 * Account-backed submission intake — POST /api/submissions when a database
 * is configured (container.ts). The JSON SubmissionService (service.ts)
 * stays the intake when it is not, and remains what the review CLI reads.
 *
 *   1. zod parse — the SAME schema and messages as the JSON path
 *   2. normalize the URL
 *   3. duplicate check: a LIVE submission at that URL (rejected and archived
 *      ones don't block, matching the partial unique index)
 *   4. duplicate check: the catalogue
 *   5. ONE transaction: insert the submission with user_id from the
 *      authenticated session + a SUBMISSION_CREATED audit event
 *
 * The submitter is the `actor` argument and nothing else. The request body
 * is parsed by a strict schema with no user field, so a `userId` (or
 * `status`) in the body is rejected outright, never read.
 */

import type { Actor } from '../auth/ownership.ts'
import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import type { Database } from '../db/client.ts'
import { duplicateUrl } from '../domain/errors.ts'
import { Prisma } from '../generated/prisma/client.ts'
import { normalizeUrl } from '../utils/normalizeUrl.ts'
import { toOwnerSubmission, type OwnerSubmissionView } from './ownerView.ts'
import { DUPLICATE_MESSAGE, parseSubmissionInput } from './service.ts'

/** Statuses that hold a site's URL. Mirrors the partial unique index in the Phase 2A migration. */
const LIVE_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED'] as const

export interface SubmitContext {
  actor: Actor
  /** X-Request-Id of the HTTP request, recorded on the audit event for log correlation. */
  requestId?: string
}

export interface AccountSubmissionService {
  submit(rawBody: unknown, context: SubmitContext): Promise<OwnerSubmissionView>
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function createAccountSubmissionService({
  db,
  catalogue,
}: {
  db: Database
  catalogue: ToolCatalogueRepository
}): AccountSubmissionService {
  return {
    async submit(rawBody, { actor, requestId }) {
      const input = parseSubmissionInput(rawBody)
      const normalized = normalizeUrl(input.siteUrl)

      const live = await db.submission.findFirst({
        where: { normalizedUrl: normalized, status: { in: [...LIVE_STATUSES] } },
        select: { id: true },
      })
      if (live) throw duplicateUrl(DUPLICATE_MESSAGE)
      if (await catalogue.findByNormalizedUrl(normalized)) throw duplicateUrl(DUPLICATE_MESSAGE)

      try {
        const created = await db.$transaction(async (tx) => {
          const submission = await tx.submission.create({
            data: {
              status: 'SUBMITTED',
              source: 'form',
              userId: actor.id,
              siteUrl: input.siteUrl,
              normalizedUrl: normalized,
              name: input.name,
              tagline: input.tagline,
              description: input.description,
              category: input.category,
              pricingModel: input.pricingModel,
              price: input.price ?? null,
              tags: input.tags,
              audience: input.audience ?? null,
              alternatives: input.alternatives,
              faqs: input.faqs,
              launchStory: input.launchStory ?? null,
              plan: input.plan,
              launchWeekId: input.launchWeekId,
            },
          })
          await tx.submissionEvent.create({
            data: {
              submissionId: submission.id,
              actorType: 'OWNER',
              actorUserId: actor.id,
              eventType: 'SUBMISSION_CREATED',
              fromStatus: null,
              toStatus: 'SUBMITTED',
              metadata: { source: 'form', plan: input.plan },
              requestId: requestId ?? null,
            },
          })
          return submission
        })
        return toOwnerSubmission(created)
      } catch (error) {
        // Two submissions of the same site racing past the check above: the
        // partial unique index decides, and the loser gets the same 409.
        if (isUniqueViolation(error)) throw duplicateUrl(DUPLICATE_MESSAGE)
        throw error
      }
    },
  }
}
