/*
 * JSON → PostgreSQL mapping for the one-off legacy import.
 *
 * Pure functions, no I/O: scripts/db/importLegacy.ts owns reading files and
 * talking to the database, this module owns what a record BECOMES. Tested in
 * tests/db.mapping.test.ts, including a lossless round trip of every tool in
 * the real catalogue.
 *
 * ── Tools ────────────────────────────────────────────────────────────────────
 * Field for field. Ids are preserved verbatim. The only transformations:
 *   isMcpServer   absent → false (only ever `true` or absent in the JSON)
 *   plainLine     absent → NULL
 *   addedAt       "YYYY-MM-DD" → DATE
 *   normalizedUrl computed with utils/normalizeUrl.ts (new column)
 * rowToTool() reverses all four, so the catalogue's Postgres adapter can
 * hand the rest of the server byte-identical `Tool` objects.
 *
 * ── Submissions ──────────────────────────────────────────────────────────────
 *   pending  → SUBMITTED
 *   approved → PUBLISHED, linked to the catalogue tool at the same normalized
 *              URL — the review script only ever marked a submission approved
 *              AFTER writing that tool. If no such tool exists (its write was
 *              lost), → APPROVED, unlinked, and the importer reports it.
 *   rejected → REJECTED, reviewNote → rejection_reason
 * Ids are preserved. `submittedFromIp` is DROPPED: never set by the current
 * code, and storing an IP needs a reason this import doesn't have.
 */

import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { Tool } from '../../domain/types.ts'
import type { Prisma, Tool as ToolRow } from '../../generated/prisma/client.ts'
import { normalizeUrl } from '../../utils/normalizeUrl.ts'

/* ── Tools ───────────────────────────────────────────────────────────────── */

export function dateFromIsoDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

export function isoDayFromDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function toolToRow(tool: Tool, source: 'seed' | 'submission' = 'seed'): Prisma.ToolCreateInput {
  return {
    id: tool.id,
    slug: tool.slug,
    name: tool.name,
    mono: tool.mono,
    cat: tool.cat,
    model: tool.model,
    tagline: tool.tagline,
    plainLine: tool.plainLine ?? null,
    rating: tool.rating,
    reviews: tool.reviews,
    price: tool.price,
    trend: tool.trend,
    badge: tool.badge,
    tags: [...tool.tags],
    pop: tool.pop,
    isMcpServer: tool.isMcpServer === true,
    api: tool.api,
    ctx: tool.ctx,
    team: tool.team,
    trial: tool.trial,
    integr: tool.integr,
    url: tool.url,
    normalizedUrl: normalizeUrl(tool.url),
    summary: tool.summary,
    roles: [...tool.roles],
    useCases: [...tool.useCases],
    stages: [...tool.stages],
    pricingTier: tool.pricingTier,
    status: tool.status,
    verified: tool.verified,
    addedAt: tool.addedAt ? dateFromIsoDay(tool.addedAt) : null,
    source,
  }
}

/**
 * The inverse of toolToRow. Optional fields are omitted (not set to
 * undefined) when empty, matching how the JSON records are written.
 */
export function rowToTool(row: ToolRow): Tool {
  const tool: Tool = {
    id: row.id,
    name: row.name,
    mono: row.mono,
    cat: row.cat as Tool['cat'],
    model: row.model as Tool['model'],
    tagline: row.tagline,
    rating: row.rating,
    reviews: row.reviews,
    price: row.price,
    trend: row.trend,
    badge: row.badge,
    tags: [...row.tags],
    pop: row.pop,
    api: row.api,
    ctx: row.ctx,
    team: row.team,
    trial: row.trial,
    integr: row.integr,
    slug: row.slug,
    url: row.url,
    summary: row.summary,
    roles: [...row.roles] as Tool['roles'],
    useCases: [...row.useCases],
    stages: [...row.stages] as Tool['stages'],
    pricingTier: row.pricingTier as Tool['pricingTier'],
    status: row.status,
    verified: row.verified,
  }
  if (row.plainLine !== null) tool.plainLine = row.plainLine
  if (row.isMcpServer) tool.isMcpServer = true
  if (row.addedAt !== null) tool.addedAt = isoDayFromDate(row.addedAt)
  return tool
}

/** Key order is irrelevant; compares content only. */
export function toolsEqual(a: Tool, b: Tool): boolean {
  return isDeepStrictEqual(sortKeys(a), sortKeys(b))
}

function sortKeys<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([x], [y]) => x.localeCompare(y)))
}

/* ── Submissions ─────────────────────────────────────────────────────────── */

/**
 * The shape data/submissions.json was written in (submissions/types.ts at
 * the time of the switch). `.strict()`: an unexpected key aborts the import
 * so a surprise in the production file is looked at, not silently dropped.
 */
export const LegacySubmissionSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['pending', 'approved', 'rejected']),
    createdAt: z.iso.datetime(),
    siteUrl: z.string().min(1),
    normalizedUrl: z.string().min(1),
    name: z.string().min(1),
    tagline: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    pricingModel: z.string().min(1),
    price: z.string().optional(),
    tags: z.array(z.string()),
    audience: z.string().optional(),
    alternatives: z.array(z.string()),
    faqs: z.array(z.object({ question: z.string(), answer: z.string() }).strict()),
    launchStory: z.string().optional(),
    plan: z.enum(['free', 'featured']),
    launchWeekId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    submittedFromIp: z.string().optional(),
    reviewNote: z.string().optional(),
  })
  .strict()

export type LegacySubmission = z.infer<typeof LegacySubmissionSchema>

export interface MappedSubmission {
  row: Prisma.SubmissionUncheckedCreateInput
  /** What the LEGACY_IMPORTED audit event records about the mapping. */
  eventMetadata: Record<string, string | string[] | null>
  /** Human-readable notes for the import report. Not errors. */
  warnings: string[]
}

/**
 * @param findToolIdByNormalizedUrl resolves against the catalogue as it will
 *   exist after the tools import (the importer passes an in-memory index).
 */
export function legacySubmissionToRow(
  legacy: LegacySubmission,
  findToolIdByNormalizedUrl: (normalizedUrl: string) => string | undefined,
): MappedSubmission {
  const warnings: string[] = []
  const recomputed = normalizeUrl(legacy.siteUrl)
  if (recomputed !== legacy.normalizedUrl) {
    warnings.push(
      `normalizedUrl "${legacy.normalizedUrl}" recomputed as "${recomputed}" (normalizer changed since intake).`,
    )
  }

  const linkedToolId = findToolIdByNormalizedUrl(recomputed)
  let status: MappedSubmission['row']['status']
  switch (legacy.status) {
    case 'pending':
      status = 'SUBMITTED'
      break
    case 'rejected':
      status = 'REJECTED'
      break
    case 'approved':
      status = linkedToolId ? 'PUBLISHED' : 'APPROVED'
      if (!linkedToolId) {
        warnings.push('approved, but no catalogue tool has this URL — imported as APPROVED (unpublished).')
      }
      break
  }

  const dropped = legacy.submittedFromIp !== undefined ? ['submittedFromIp'] : []
  const createdAt = new Date(legacy.createdAt)

  return {
    row: {
      id: legacy.id,
      status,
      revision: 1,
      source: 'legacy_json',
      userId: null,
      toolId: legacy.status === 'approved' ? (linkedToolId ?? null) : null,
      siteUrl: legacy.siteUrl,
      normalizedUrl: recomputed,
      name: legacy.name,
      tagline: legacy.tagline,
      description: legacy.description,
      category: legacy.category,
      pricingModel: legacy.pricingModel,
      price: legacy.price ?? null,
      tags: [...legacy.tags],
      audience: legacy.audience ?? null,
      alternatives: [...legacy.alternatives],
      faqs: legacy.faqs.map(({ question, answer }) => ({ question, answer })),
      launchStory: legacy.launchStory ?? null,
      plan: legacy.plan,
      launchWeekId: legacy.launchWeekId,
      ownerMessage: null,
      rejectionReason: legacy.status === 'rejected' ? (legacy.reviewNote ?? null) : null,
      reviewerId: null,
      submittedAt: createdAt,
      // The JSON store never recorded when a review happened or who did it.
      // Left NULL rather than invented; the audit event says so.
      reviewedAt: null,
      publishedAt: null,
      createdAt,
    },
    eventMetadata: {
      legacyStatus: legacy.status,
      legacyCreatedAt: legacy.createdAt,
      legacyNormalizedUrl: legacy.normalizedUrl,
      linkedToolId: legacy.status === 'approved' ? (linkedToolId ?? null) : null,
      reviewTimestampsUnknown: legacy.status === 'pending' ? null : 'true',
      droppedFields: dropped,
    },
    warnings,
  }
}

/**
 * The columns legacySubmissionToRow sets, compared against an existing row —
 * the importer's "already imported and identical?" check. Returns the names
 * of the columns that differ.
 */
export function diffSubmissionRow(
  planned: Prisma.SubmissionUncheckedCreateInput,
  existing: Record<string, unknown>,
): string[] {
  const differing: string[] = []
  for (const [key, value] of Object.entries(planned)) {
    if (!isDeepStrictEqual(comparable(value), comparable(existing[key]))) differing.push(key)
  }
  return differing
}

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (value === undefined) return null
  return value
}
