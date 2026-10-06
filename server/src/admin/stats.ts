/*
 * Dashboard statistics — every number is a COUNT or GROUP BY over the
 * database at request time, nothing cached and nothing hardcoded.
 *
 * Definitions (the dashboard labels each one the same way):
 *   catalogue.database        rows in `tools`, by status
 *   catalogue.fromSubmissions rows in `tools` created by approving a submission
 *   catalogue.liveActive      active tools in the catalogue the public site
 *                             serves today (the bundled JSON catalogue)
 *   submissions.awaitingReview   SUBMITTED + UNDER_REVIEW
 *   submissions.changesRequested CHANGES_REQUESTED (waiting on the submitter)
 *   submissions.approved         APPROVED + PUBLISHED
 *   submissions.rejected         REJECTED
 *   moderation.decisions      APPROVED / REJECTED / CHANGES_REQUESTED events
 *                             in the last ADMIN.activityWindowMs
 */

import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import { ADMIN } from '../config/limits.ts'
import type { Database } from '../db/client.ts'
import { SubmissionStatus, ToolStatus, UserRole } from '../generated/prisma/enums.ts'
import type { AuditEntryView, AuditService } from './audit.ts'

export interface AdminStats {
  generatedAt: string
  catalogue: {
    databaseTotal: number
    byStatus: Record<ToolStatus, number>
    fromSubmissions: number
    liveActive: number
  }
  submissions: {
    total: number
    byStatus: Record<SubmissionStatus, number>
    awaitingReview: number
    changesRequested: number
    approved: number
    rejected: number
  }
  users: {
    total: number
    byRole: Record<UserRole, number>
  }
  moderation: { decisions: number; windowDays: number }
  recentActivity: AuditEntryView[]
}

function zeroes<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
}

export interface StatsService {
  get(): Promise<AdminStats>
}

export function createStatsService({
  db,
  catalogue,
  audit,
  now = () => new Date(),
}: {
  db: Database
  catalogue: ToolCatalogueRepository
  audit: AuditService
  now?: () => Date
}): StatsService {
  return {
    async get() {
      const since = new Date(now().getTime() - ADMIN.activityWindowMs)
      const [toolsByStatus, fromSubmissions, submissionsByStatus, usersByRole, decisions, liveActive, recentActivity] = await Promise.all([
        db.tool.groupBy({ by: ['status'], _count: { _all: true } }),
        db.tool.count({ where: { source: 'submission' } }),
        db.submission.groupBy({ by: ['status'], _count: { _all: true } }),
        db.user.groupBy({ by: ['role'], _count: { _all: true } }),
        db.submissionEvent.count({
          where: { eventType: { in: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] }, createdAt: { gte: since } },
        }),
        catalogue.size(),
        audit.recentAdminActivity(),
      ])

      const toolCounts = zeroes(Object.values(ToolStatus))
      for (const row of toolsByStatus) toolCounts[row.status] = row._count._all
      const submissionCounts = zeroes(Object.values(SubmissionStatus))
      for (const row of submissionsByStatus) submissionCounts[row.status] = row._count._all
      const roleCounts = zeroes(Object.values(UserRole))
      for (const row of usersByRole) roleCounts[row.role] = row._count._all

      const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0)

      return {
        generatedAt: now().toISOString(),
        catalogue: { databaseTotal: sum(toolCounts), byStatus: toolCounts, fromSubmissions, liveActive },
        submissions: {
          total: sum(submissionCounts),
          byStatus: submissionCounts,
          awaitingReview: submissionCounts.SUBMITTED + submissionCounts.UNDER_REVIEW,
          changesRequested: submissionCounts.CHANGES_REQUESTED,
          approved: submissionCounts.APPROVED + submissionCounts.PUBLISHED,
          rejected: submissionCounts.REJECTED,
        },
        users: { total: sum(roleCounts), byRole: roleCounts },
        moderation: { decisions, windowDays: Math.round(ADMIN.activityWindowMs / (24 * 60 * 60 * 1000)) },
        recentActivity,
      }
    },
  }
}
