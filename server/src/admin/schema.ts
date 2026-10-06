/*
 * Request schemas for the admin API (Phase 6).
 *
 * Bodies are `.strict()` for the same reason as auth/schema.ts: a key the
 * route does not expect (`status`, `actorUserId`, `reviewerId`, `userId`...)
 * is rejected outright, never ignored and never read. Identity, status and
 * audit metadata come from the session and the database, not the client.
 *
 * Query strings are lenient about shape (Express hands over strings) but
 * strict about values: unknown enum values and out-of-range pages are 400s.
 */

import { z } from 'zod'
import { TOOL_STATUSES } from '../catalogue/taxonomy.ts'
import { ADMIN } from '../config/limits.ts'
import { SubmissionStatus, ToolSource, UserRole } from '../generated/prisma/enums.ts'

const page = z.coerce.number().int().min(1).default(1)
const pageSize = z.coerce.number().int().min(1).max(ADMIN.maxPageSize).default(ADMIN.defaultPageSize)
const search = z
  .string()
  .trim()
  .max(ADMIN.maxSearchChars)
  .optional()
  .transform((value) => (value ? value : undefined))

/** One value, or several as `?status=A&status=B` / `?status=A,B`. */
function enumList<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((raw) =>
      raw === undefined
        ? undefined
        : (Array.isArray(raw) ? raw : [raw]).flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).optional())
}

const SUBMISSION_STATUSES = Object.values(SubmissionStatus) as [SubmissionStatus, ...SubmissionStatus[]]
const USER_ROLES = Object.values(UserRole) as [UserRole, ...UserRole[]]
const TOOL_SOURCES = Object.values(ToolSource) as [ToolSource, ...ToolSource[]]

function withOffsetCap<T extends { page: number; pageSize: number }>(schema: z.ZodType<T>) {
  return schema.refine((value) => (value.page - 1) * value.pageSize <= ADMIN.maxOffset, {
    message: `page is too deep; narrow the search instead (max offset ${ADMIN.maxOffset}).`,
    path: ['page'],
  })
}

export const SubmissionListQuerySchema = withOffsetCap(
  z.object({
    page,
    pageSize,
    q: search,
    status: enumList(SUBMISSION_STATUSES),
    sort: z.enum(['submitted', 'updated']).default('submitted'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
)

export const ToolListQuerySchema = withOffsetCap(
  z.object({
    page,
    pageSize,
    q: search,
    status: enumList(TOOL_STATUSES),
    category: z.string().trim().max(80).optional(),
    source: enumList(TOOL_SOURCES),
  }),
)

export const UserListQuerySchema = withOffsetCap(
  z.object({
    page,
    pageSize,
    q: search,
    role: enumList(USER_ROLES),
  }),
)

export const AuditListQuerySchema = withOffsetCap(
  z.object({
    page,
    pageSize,
    /** submission = submission_events, admin = admin_audit_events. */
    kind: z.enum(['all', 'submission', 'admin']).default('all'),
  }),
)

/* ── Moderation bodies ──────────────────────────────────────────────────── */

const reason = (what: string) =>
  z
    .string({ message: `Write ${what}.` })
    .trim()
    .min(ADMIN.reasonMinChars, { message: `Write ${what} of at least ${ADMIN.reasonMinChars} characters.` })
    .max(ADMIN.reasonMaxChars, { message: `Keep it to ${ADMIN.reasonMaxChars} characters or fewer.` })

export const RejectSchema = z.object({ reason: reason('a reason the submitter will read') }).strict()

export const RequestChangesSchema = z.object({ message: reason('what the submitter should change') }).strict()

export const NoteSchema = z
  .object({
    note: z
      .string({ message: 'Write a note.' })
      .trim()
      .min(1, { message: 'Write a note.' })
      .max(ADMIN.noteMaxChars, { message: `Keep notes to ${ADMIN.noteMaxChars} characters or fewer.` }),
  })
  .strict()

/**
 * The reviewer-confirmed fields an approval needs — the same set the review
 * CLI asks for (review/buildTool.ts ReviewedFields). Shape only here; the
 * built tool is then validated as a whole by the catalogue's own ToolSchema,
 * so the catalogue's rules are enforced once, in one place.
 */
export const ApproveSchema = z
  .object({
    tool: z
      .object({
        slug: z.string().trim(),
        mono: z.string(),
        price: z.string().trim(),
        pop: z.number().int(),
        roles: z.array(z.string()),
        stages: z.array(z.string()),
        useCases: z.array(z.string()),
        tags: z.array(z.string().trim()),
        summary: z.string().trim(),
      })
      .strict(),
  })
  .strict()

/* ── Tool edits ─────────────────────────────────────────────────────────── */

/**
 * The catalogue fields an admin may correct. Deliberately NOT here:
 *   id, slug        identifiers — usage stories, automations and links use them
 *   status          publication, which is not part of Phase 6
 *   rating, reviews, pop, trend, badge, addedAt, source
 *                   editorial or system metadata, not corrections
 * Every value is validated again, together with the rest of the record, by
 * the catalogue's ToolSchema before anything is written.
 */
export const ToolPatchSchema = z
  .object({
    /** The tool's updatedAt as the editor loaded it. A stale value is a 409, not a silent overwrite. */
    expectedUpdatedAt: z.iso.datetime({ message: 'expectedUpdatedAt must be the timestamp the tool was loaded with.' }),
    changes: z
      .object({
        name: z.string(),
        mono: z.string(),
        tagline: z.string(),
        plainLine: z.string().nullable(),
        summary: z.string(),
        url: z.string(),
        cat: z.string(),
        model: z.string(),
        pricingTier: z.string(),
        price: z.string(),
        tags: z.array(z.string()),
        roles: z.array(z.string()),
        useCases: z.array(z.string()),
        stages: z.array(z.string()),
        verified: z.boolean(),
        isMcpServer: z.boolean(),
        api: z.string(),
        ctx: z.string(),
        team: z.string(),
        trial: z.string(),
        integr: z.string(),
      })
      .partial()
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, { message: 'Change at least one field.' }),
  })
  .strict()

export type ToolChanges = z.infer<typeof ToolPatchSchema>['changes']
export type ApproveInput = z.infer<typeof ApproveSchema>
