import { Link } from 'react-router-dom'
import AuditList from '@/components/admin/AuditList'
import { EmptyState, PageTitle, Panel, ResourceView } from '@/components/admin/AdminStates'
import Button from '@/components/ui/Button'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminStats } from '@/services/admin'
import type { AdminStats } from '@/types/admin'
import { adminHead, formatDateTime, ROLE_LABEL } from '@/utils/adminFormat'

/*
 * /admin — the overview. Every number is GET /api/admin/stats, computed
 * from the database on request (server/src/admin/stats.ts defines each).
 */

function Stat({ label, value, hint, to }: { label: string; value: number; hint: string; to?: string }) {
  const body = (
    <>
      <span className="text-[12px] tracking-[0.08em] text-stat-label uppercase">{label}</span>
      <span className="mt-2 text-[32px] font-bold tracking-[-0.04em] text-ink tabular-nums">{value.toLocaleString()}</span>
      <span className="mt-1 text-[12.5px] leading-[1.5] text-muted-dim">{hint}</span>
    </>
  )
  const classes = 'flex flex-col rounded-card border border-hairline bg-[image:var(--gradient-spot)] p-5 shadow-card-flat'
  return to ? (
    <Link to={to} className={`${classes} transition-[border-color] duration-200 hover:border-accent-line`}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

function Overview({ stats }: { stats: AdminStats }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Awaiting review"
          value={stats.submissions.awaitingReview}
          hint="Submitted or under review"
          to="/admin/submissions?status=SUBMITTED,UNDER_REVIEW"
        />
        <Stat
          label="Changes requested"
          value={stats.submissions.changesRequested}
          hint="Waiting on the submitter"
          to="/admin/submissions?status=CHANGES_REQUESTED"
        />
        <Stat label="Approved" value={stats.submissions.approved} hint="Approved or published" to="/admin/submissions?status=APPROVED,PUBLISHED" />
        <Stat label="Rejected" value={stats.submissions.rejected} hint="Kept for the record, never deleted" to="/admin/submissions?status=REJECTED" />
        <Stat
          label="Live catalogue"
          value={stats.catalogue.liveActive}
          hint="Active tools the public site serves today"
        />
        <Stat
          label="Database catalogue"
          value={stats.catalogue.databaseTotal}
          hint={`${stats.catalogue.byStatus.active} active · ${stats.catalogue.byStatus.draft} draft · ${stats.catalogue.fromSubmissions} from submissions`}
          to="/admin/tools"
        />
        <Stat
          label="Accounts"
          value={stats.users.total}
          hint={`${stats.users.byRole.TOOL_OWNER} ${ROLE_LABEL.TOOL_OWNER.toLowerCase()}s · ${stats.users.byRole.ADMIN + stats.users.byRole.SUPER_ADMIN} admins`}
          to="/admin/users"
        />
        <Stat
          label={`Decisions, ${stats.moderation.windowDays} days`}
          value={stats.moderation.decisions}
          hint="Approvals, rejections and change requests"
          to="/admin/audit"
        />
      </div>

      <Panel
        title="Recent admin activity"
        actions={
          <Link to="/admin/audit" className="text-[13.5px] font-semibold text-accent hover:text-ink">
            Full audit log →
          </Link>
        }
      >
        {stats.recentActivity.length === 0 ? (
          <EmptyState>No moderation or admin actions yet.</EmptyState>
        ) : (
          <AuditList entries={stats.recentActivity} />
        )}
      </Panel>

      <p className="text-[12.5px] text-subtle">Figures as of {formatDateTime(stats.generatedAt)}.</p>
    </div>
  )
}

export default function AdminDashboardPage() {
  useDocumentMeta(adminHead('Overview'))
  const { state, reload } = useAdminResource((signal) => fetchAdminStats(signal), [])
  return (
    <>
      <PageTitle
        title="Overview"
        subtitle="Moderation queue, catalogue and accounts at a glance."
        actions={
          <>
            <Button to="/admin/submissions?status=SUBMITTED,UNDER_REVIEW">Review queue</Button>
            <Button variant="outline" to="/admin/tools">
              Catalogue
            </Button>
          </>
        }
      />
      <div className="mt-8">
        <ResourceView state={state} onRetry={reload} what="statistics">
          {(stats) => <Overview stats={stats} />}
        </ResourceView>
      </div>
    </>
  )
}
