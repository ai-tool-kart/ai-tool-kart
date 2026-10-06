/*
 * Submission moderation — the admin side of the Phase 2C state machine.
 *
 * ── Transitions (the only ones this module makes) ─────────────────────────
 *
 *   SUBMITTED | UNDER_REVIEW          ──approve──────────▶ APPROVED
 *   SUBMITTED | UNDER_REVIEW          ──request changes──▶ CHANGES_REQUESTED
 *   SUBMITTED | UNDER_REVIEW
 *     | CHANGES_REQUESTED             ──reject───────────▶ REJECTED
 *   any status                        ──note─────────────▶ (unchanged)
 *
 * Anything else is a 409 CONFLICT naming the current status. That covers
 * duplicates too: approving an APPROVED submission, rejecting a REJECTED one.
 *
 * ── Concurrency ───────────────────────────────────────────────────────────
 * Every decision runs in ONE transaction that starts by taking a row lock
 * (SELECT ... FOR UPDATE) on the submission. Two admins deciding at once
 * serialize on that lock: the second reads the first's committed status and
 * gets the same 409 as any other invalid transition. The status change, the
 * reviewer fields, any catalogue/ownership rows and the audit event commit
 * together or not at all.
 *
 * ── Approval ──────────────────────────────────────────────────────────────
 * Approval builds the catalogue record with the review CLI's own pure
 * mapping (review/buildTool.ts) from the admin-confirmed fields, validates
 * the WHOLE record with the catalogue's ToolSchema, and inserts it into the
 * Postgres `tools` table as status 'draft', source 'submission'.
 *
 * 'draft' on purpose. APPROVED means "accepted, not yet live" (PUBLISHED is
 * the live state), and the public catalogue is still served from the bundled
 * JSON catalogue (container.ts), so nothing a moderator does here changes what
 * visitors see. Publishing is a separate, later decision.
 *
 * Duplicates are refused, never merged: a tool already at the same
 * normalized URL, in the database OR the live catalogue, is a 409
 * DUPLICATE_URL (the admin should reject the submission as a duplicate),
 * and a slug or id already in use is a 409 CONFLICT on `tool.slug`. The
 * unique indexes on tools are the backstop for a race between two approvals.
 *
 * The submitter (when the submission has one; legacy imports do not) is
 * granted ownership of the new tool in the same transaction.
 *
 * ── What the submitter sees ───────────────────────────────────────────────
 * Rejection reasons and change requests are written FOR the submitter and
 * appear in /me/submissions (submissions/ownerView.ts). Internal notes are
 * NOTE_ADDED events: the owner view never reads events, so they cannot leak
 * through it, and no public route reads submission_events at all.
 */

import type { Actor } from '../auth/ownership.ts'
import { syncDerivedRole, UUID_PATTERN, SUBMISSION_NOT_FOUND_MESSAGE } from '../auth/ownership.ts'
import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import { ToolSchema } from '../catalogue/schema.ts'
import type { Database } from '../db/client.ts'
import { isoDayFromDate, toolToRow } from '../db/legacy/mapping.ts'
import { conflict, duplicateUrl, notFound, validationFailed } from '../domain/errors.ts'
import type { Tool } from '../domain/types.ts'
import { Prisma, type Submission, type SubmissionStatus } from '../generated/prisma/client.ts'
import { buildTool, type ReviewedFields } from '../review/buildTool.ts'
import { proposeMono, proposePrice, proposeRoles, proposeSummary, proposeTags, PROPOSED_POP } from '../review/propose.ts'
import { slugify, truncateSlug } from '../review/slug.ts'
import { normalizeUrl } from '../utils/normalizeUrl.ts'
import { recordAdminAction, type ActorView } from './audit.ts'
import { fieldsFromZod, parseBody } from './parse.ts'
import { ApproveSchema, NoteSchema, RejectSchema, RequestChangesSchema } from './schema.ts'

type Tx = Prisma.TransactionClient

const DECIDABLE: readonly SubmissionStatus[] = ['SUBMITTED', 'UNDER_REVIEW']
const REJECTABLE: readonly SubmissionStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED']

export type ModerationAction = 'approve' | 'reject' | 'requestChanges' | 'note'

export function allowedActions(status: SubmissionStatus): ModerationAction[] {
  const actions: ModerationAction[] = []
  if (DECIDABLE.includes(status)) actions.push('approve', 'requestChanges')
  if (REJECTABLE.includes(status)) actions.push('reject')
  actions.push('note')
  return actions
}

/* ── Views ──────────────────────────────────────────────────────────────── */

export interface SubmitterView extends ActorView {
  role: string
  createdAt: string
}

export interface AdminSubmissionListItem {
  id: string
  status: SubmissionStatus
  revision: number
  source: Submission['source']
  name: string
  siteUrl: string
  category: string
  plan: Submission['plan']
  submitter: ActorView | null
  submittedAt: string
  updatedAt: string
  reviewedAt: string | null
}

export interface SubmissionEventView {
  id: string
  type: string
  actorType: 'OWNER' | 'ADMIN' | 'SYSTEM'
  actor: ActorView | null
  fromStatus: SubmissionStatus | null
  toStatus: SubmissionStatus | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AdminSubmissionDetail extends AdminSubmissionListItem {
  /** The catalogue record this submission produced, once approved. */
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
  submitter: SubmitterView | null
  reviewer: ActorView | null
  tool: { id: string; name: string; slug: string; status: string } | null
  events: SubmissionEventView[]
  allowedActions: ModerationAction[]
  /** Pre-filled approval fields, present only while approval is possible. */
  proposal: ReviewedFields | null
  duplicates: {
    /** A catalogue record already at this normalized URL — the database's or the live catalogue's. */
    catalogueTool: { id: string; name: string; location: 'database' | 'live-catalogue' } | null
    /** Other submissions of the same site. */
    otherSubmissions: { id: string; name: string; status: SubmissionStatus }[]
  }
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface SubmissionListQuery {
  page: number
  pageSize: number
  q?: string | undefined
  status?: SubmissionStatus[] | undefined
  sort: 'submitted' | 'updated'
  order: 'asc' | 'desc'
}

export interface ActionContext {
  actor: Actor
  requestId?: string | undefined
}

export interface ModerationService {
  list(query: SubmissionListQuery): Promise<Paged<AdminSubmissionListItem>>
  get(submissionId: string): Promise<AdminSubmissionDetail>
  approve(submissionId: string, rawBody: unknown, context: ActionContext): Promise<AdminSubmissionDetail>
  reject(submissionId: string, rawBody: unknown, context: ActionContext): Promise<AdminSubmissionDetail>
  requestChanges(submissionId: string, rawBody: unknown, context: ActionContext): Promise<AdminSubmissionDetail>
  addNote(submissionId: string, rawBody: unknown, context: ActionContext): Promise<AdminSubmissionDetail>
}

const USER_SUMMARY = { select: { id: true, email: true, name: true } } as const
const SUBMITTER = { select: { id: true, email: true, name: true, role: true, createdAt: true } } as const

function actorView(user: { id: string; email: string; name: string | null } | null): ActorView | null {
  return user ? { id: user.id, email: user.email, name: user.name } : null
}

type ListRow = Submission & { user: { id: string; email: string; name: string | null } | null }

function toListItem(row: ListRow): AdminSubmissionListItem {
  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    source: row.source,
    name: row.name,
    siteUrl: row.siteUrl,
    category: row.category,
    plan: row.plan,
    submitter: actorView(row.user),
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }
}

function statusLabel(status: SubmissionStatus): string {
  return status.toLowerCase().replace(/_/g, ' ')
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export interface CreateModerationServiceOptions {
  db: Database
  /** The LIVE catalogue (JSON today). Consulted for duplicates, never written. */
  catalogue: ToolCatalogueRepository
  now?: () => Date
}

export function createModerationService({ db, catalogue, now = () => new Date() }: CreateModerationServiceOptions): ModerationService {
  /** Locks the row for the rest of the transaction. NOT_FOUND for unknown or malformed ids alike. */
  async function lock(tx: Tx, submissionId: string): Promise<Submission> {
    if (!UUID_PATTERN.test(submissionId)) throw notFound(SUBMISSION_NOT_FOUND_MESSAGE)
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM submissions WHERE id = ${submissionId}::uuid FOR UPDATE`
    if (locked.length === 0) throw notFound(SUBMISSION_NOT_FOUND_MESSAGE)
    return tx.submission.findUniqueOrThrow({ where: { id: submissionId } })
  }

  function assertFrom(submission: Submission, allowed: readonly SubmissionStatus[], verb: string): void {
    if (!allowed.includes(submission.status)) {
      throw conflict(`This submission is ${statusLabel(submission.status)}, so it cannot be ${verb}. Reload to see its current state.`)
    }
  }

  /** True when `slug` is free as both an id and a slug, in the database and the live catalogue. */
  async function slugIsFree(client: Tx | Database, slug: string): Promise<boolean> {
    const [inDb, byId, bySlug] = await Promise.all([
      client.tool.findFirst({ where: { OR: [{ id: slug }, { slug }] }, select: { id: true } }),
      catalogue.findById(slug),
      catalogue.findBySlug(slug),
    ])
    return !inDb && !byId && !bySlug
  }

  async function proposeSlug(name: string): Promise<string> {
    const base = slugify(name)
    for (let n = 1; n < 50; n++) {
      const suffix = n === 1 ? '' : `-${n}`
      const candidate = truncateSlug(base, 64 - suffix.length) + suffix
      if (await slugIsFree(db, candidate)) return candidate
    }
    return truncateSlug(base)
  }

  async function catalogueMatch(normalizedUrl: string): Promise<AdminSubmissionDetail['duplicates']['catalogueTool']> {
    const inDb = await db.tool.findUnique({ where: { normalizedUrl }, select: { id: true, name: true } })
    if (inDb) return { ...inDb, location: 'database' }
    const live = await catalogue.findByNormalizedUrl(normalizedUrl)
    return live ? { id: live.id, name: live.name, location: 'live-catalogue' } : null
  }

  async function get(submissionId: string): Promise<AdminSubmissionDetail> {
    if (!UUID_PATTERN.test(submissionId)) throw notFound(SUBMISSION_NOT_FOUND_MESSAGE)
    const row = await db.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: SUBMITTER,
        reviewer: USER_SUMMARY,
        tool: { select: { id: true, name: true, slug: true, status: true } },
        events: { include: { actor: USER_SUMMARY }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    })
    if (!row) throw notFound(SUBMISSION_NOT_FOUND_MESSAGE)

    const actions = allowedActions(row.status)
    const [catalogueTool, otherSubmissions, proposal] = await Promise.all([
      catalogueMatch(row.normalizedUrl),
      db.submission.findMany({
        where: { normalizedUrl: row.normalizedUrl, id: { not: row.id } },
        select: { id: true, name: true, status: true },
        orderBy: { submittedAt: 'desc' },
        take: 20,
      }),
      actions.includes('approve')
        ? proposeSlug(row.name).then(
            (slug): ReviewedFields => ({
              slug,
              mono: proposeMono(row.name),
              price: proposePrice(row.price ?? undefined),
              pop: PROPOSED_POP,
              roles: proposeRoles(row.audience ?? undefined),
              stages: [],
              useCases: [],
              tags: proposeTags(row.tags, row.category),
              summary: proposeSummary(row.description),
            }),
          )
        : Promise.resolve(null),
    ])

    return {
      ...toListItem(row),
      toolId: row.toolId,
      normalizedUrl: row.normalizedUrl,
      tagline: row.tagline,
      description: row.description,
      pricingModel: row.pricingModel,
      price: row.price,
      tags: row.tags,
      audience: row.audience,
      alternatives: row.alternatives,
      faqs: row.faqs,
      launchStory: row.launchStory,
      launchWeekId: row.launchWeekId,
      ownerMessage: row.ownerMessage,
      rejectionReason: row.rejectionReason,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      submitter: row.user
        ? { id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role, createdAt: row.user.createdAt.toISOString() }
        : null,
      reviewer: actorView(row.reviewer),
      tool: row.tool,
      events: row.events.map((event) => ({
        id: event.id,
        type: event.eventType,
        actorType: event.actorType,
        actor: actorView(event.actor),
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        metadata: typeof event.metadata === 'object' && event.metadata !== null ? (event.metadata as Record<string, unknown>) : {},
        createdAt: event.createdAt.toISOString(),
      })),
      allowedActions: actions,
      proposal,
      duplicates: { catalogueTool, otherSubmissions },
    }
  }

  /** Status change + reviewer fields + audit event, inside the caller's locked transaction. */
  async function decide(
    tx: Tx,
    submission: Submission,
    to: SubmissionStatus,
    eventType: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
    data: Prisma.SubmissionUncheckedUpdateInput,
    metadata: Record<string, unknown>,
    { actor, requestId }: ActionContext,
  ): Promise<void> {
    await tx.submission.update({
      where: { id: submission.id },
      data: { ...data, status: to, reviewerId: actor.id, reviewedAt: now() },
    })
    await tx.submissionEvent.create({
      data: {
        submissionId: submission.id,
        actorType: 'ADMIN',
        actorUserId: actor.id,
        eventType,
        fromStatus: submission.status,
        toStatus: to,
        metadata: metadata as Prisma.InputJsonObject,
        requestId: requestId ?? null,
      },
    })
  }

  return {
    async list({ page, pageSize, q, status, sort, order }) {
      const where: Prisma.SubmissionWhereInput = {
        ...(status && status.length > 0 ? { status: { in: status } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { siteUrl: { contains: q, mode: 'insensitive' } },
                { user: { is: { email: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      }
      const orderBy: Prisma.SubmissionOrderByWithRelationInput[] = [
        sort === 'updated' ? { updatedAt: order } : { submittedAt: order },
        { id: 'asc' },
      ]
      const [rows, total] = await Promise.all([
        db.submission.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { user: USER_SUMMARY } }),
        db.submission.count({ where }),
      ])
      return { items: rows.map(toListItem), total, page, pageSize }
    },

    get,

    async approve(submissionId, rawBody, context) {
      const { tool: fields } = parseBody(ApproveSchema, rawBody, 'The approval needs a few fields fixed.')
      try {
        await db.$transaction(async (tx) => {
          const submission = await lock(tx, submissionId)
          assertFrom(submission, DECIDABLE, 'approved')

          const built: Tool = {
            ...buildTool(submission, fields as ReviewedFields, isoDayFromDate(now())),
            status: 'draft',
          }
          const parsed = ToolSchema.safeParse(built)
          if (!parsed.success) {
            throw validationFailed('The catalogue record is not valid yet.', fieldsFromZod(parsed.error, 'tool.'))
          }
          const tool = parsed.data as Tool

          const normalized = normalizeUrl(tool.url)
          const existing =
            (await tx.tool.findUnique({ where: { normalizedUrl: normalized }, select: { id: true } })) ??
            (await catalogue.findByNormalizedUrl(normalized))
          if (existing) {
            throw duplicateUrl(`The catalogue already has a tool at this address ("${existing.id}"). Reject this submission as a duplicate instead.`)
          }
          if (!(await slugIsFree(tx, tool.slug))) {
            throw conflict('That slug is already used by another tool.', { 'tool.slug': 'Already in use — choose another.' })
          }

          await tx.tool.create({ data: toolToRow(tool, 'submission') })

          let ownershipGrantedTo: string | null = null
          if (submission.userId) {
            const owner = await tx.user.findUniqueOrThrow({ where: { id: submission.userId } })
            await tx.toolOwner.create({ data: { toolId: tool.id, userId: owner.id, grantedByUserId: context.actor.id } })
            const roleAfter = await syncDerivedRole(tx, owner)
            await recordAdminAction(tx, {
              actorUserId: context.actor.id,
              action: 'TOOL_OWNER_GRANTED',
              targetToolId: tool.id,
              targetUserId: owner.id,
              metadata: { via: 'approval', submissionId: submission.id, roleBefore: owner.role, roleAfter },
              requestId: context.requestId,
            })
            ownershipGrantedTo = owner.id
          }

          await decide(
            tx,
            submission,
            'APPROVED',
            'APPROVED',
            { toolId: tool.id, ownerMessage: null, rejectionReason: null },
            { toolId: tool.id, toolStatus: 'draft', ownershipGrantedTo },
            context,
          )
        })
      } catch (error) {
        // Two approvals of different submissions racing for one URL or slug:
        // the unique indexes on tools decide, and the loser hears why.
        if (isUniqueViolation(error)) {
          throw conflict('Another tool was just created with the same address or slug. Reload and check for a duplicate.')
        }
        throw error
      }
      return get(submissionId)
    },

    async reject(submissionId, rawBody, context) {
      const { reason } = parseBody(RejectSchema, rawBody, 'Give a reason for the rejection.')
      await db.$transaction(async (tx) => {
        const submission = await lock(tx, submissionId)
        assertFrom(submission, REJECTABLE, 'rejected')
        await decide(tx, submission, 'REJECTED', 'REJECTED', { rejectionReason: reason }, { reason }, context)
      })
      return get(submissionId)
    },

    async requestChanges(submissionId, rawBody, context) {
      const { message } = parseBody(RequestChangesSchema, rawBody, 'Describe the changes you need.')
      await db.$transaction(async (tx) => {
        const submission = await lock(tx, submissionId)
        assertFrom(submission, DECIDABLE, 'sent back for changes')
        await decide(tx, submission, 'CHANGES_REQUESTED', 'CHANGES_REQUESTED', { ownerMessage: message }, { message }, context)
      })
      return get(submissionId)
    },

    async addNote(submissionId, rawBody, { actor, requestId }) {
      const { note } = parseBody(NoteSchema, rawBody, 'Write a note.')
      await db.$transaction(async (tx) => {
        const submission = await lock(tx, submissionId)
        await tx.submissionEvent.create({
          data: {
            submissionId: submission.id,
            actorType: 'ADMIN',
            actorUserId: actor.id,
            eventType: 'NOTE_ADDED',
            fromStatus: submission.status,
            toStatus: submission.status,
            metadata: { note, internal: true },
            requestId: requestId ?? null,
          },
        })
      })
      return get(submissionId)
    },
  }
}
