import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AdminButton from '@/components/admin/AdminButton'
import AuditList from '@/components/admin/AuditList'
import { AdminPageHeader, EmptyState, Panel, ResourceView } from '@/components/admin/AdminStates'
import { RoleBadge } from '@/components/admin/AdminBadges'
import { LABEL, SURFACE } from '@/components/admin/adminTheme'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminStats } from '@/services/admin'
import type { AdminStats } from '@/types/admin'
import type { SubmissionStatus, UserRole } from '@/types/auth'
import { ADMIN_STATUS_LABEL, adminHead, formatDateTime } from '@/utils/adminFormat'

/*
 * /admin — the console's overview. Every number is GET /api/admin/stats,
 * computed from the database on request (server/src/admin/stats.ts defines
 * each); nothing here is derived from anything else.
 */

function Stat({ label, value, hint, to, primary = false }: { label: string; value: number; hint: string; to?: string; primary?: boolean }) {
  const body = (
    <>
      <span className={LABEL}>{label}</span>
      <span className={`mt-2 font-mono font-semibold tracking-[-0.02em] text-ink tabular-nums ${primary ? 'text-[30px]' : 'text-[22px]'}`}>
        {value.toLocaleString()}
      </span>
      <span className="mt-1 text-[12px] leading-[1.45] text-[#7f7a95]">{hint}</span>
    </>
  )
  const classes = `${SURFACE} flex flex-col ${primary ? 'p-4' : 'px-4 py-3'}`
  return to ? (
    <Link to={to} className={`${classes} transition-colors duration-100 hover:border-[#b49bff]/40 hover:bg-[#0e0d13]`}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

/** A labelled count with a proportional bar — for the status and role breakdowns. */
function Breakdown<K extends string>({ rows, total, label, render }: { rows: [K, number][]; total: number; label: string; render: (key: K) => ReactNode }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-2.5">
      {rows.map(([key, count]) => (
        <li key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="min-w-0 truncate text-[12.5px]">{render(key)}</span>
          <span className="font-mono text-[12px] text-ink tabular-nums">{count}</span>
          <span aria-hidden="true" className="col-span-2 h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
            <span className="block h-full rounded-full bg-[#b49bff]/60" style={{ width: `${total > 0 ? Math.round((count / total) * 100) : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

const QUICK_ACTIONS = [
  { label: 'Review the queue', to: '/admin/submissions?status=SUBMITTED,UNDER_REVIEW', hint: 'Submitted and under review' },
  { label: 'Follow up change requests', to: '/admin/submissions?status=CHANGES_REQUESTED', hint: 'Waiting on submitters' },
  { label: 'Database catalogue', to: '/admin/tools', hint: 'Drafts created by approval' },
  { label: 'Accounts and roles', to: '/admin/users', hint: 'Users, owners, admins' },
]

function Overview({ stats }: { stats: AdminStats }) {
  const statusRows = (Object.entries(stats.submissions.byStatus) as [SubmissionStatus, number][]).filter(([, count]) => count > 0)
  const roleRows = Object.entries(stats.users.byRole) as [UserRole, number][]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat primary label="Awaiting review" value={stats.submissions.awaitingReview} hint="Submitted or under review" to="/admin/submissions?status=SUBMITTED,UNDER_REVIEW" />
        <Stat primary label="Changes requested" value={stats.submissions.changesRequested} hint="Waiting on the submitter" to="/admin/submissions?status=CHANGES_REQUESTED" />
        <Stat primary label="Approved" value={stats.submissions.approved} hint="Approved or published" to="/admin/submissions?status=APPROVED,PUBLISHED" />
        <Stat
          primary
          label="Accounts"
          value={stats.users.total}
          hint={`${stats.users.byRole.TOOL_OWNER} tool owner${stats.users.byRole.TOOL_OWNER === 1 ? '' : 's'} · ${stats.users.byRole.ADMIN + stats.users.byRole.SUPER_ADMIN} admin${stats.users.byRole.ADMIN + stats.users.byRole.SUPER_ADMIN === 1 ? '' : 's'}`}
          to="/admin/users"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Rejected" value={stats.submissions.rejected} hint="Kept for the record" to="/admin/submissions?status=REJECTED" />
        <Stat label="Live catalogue" value={stats.catalogue.liveActive} hint="Served to the public today" />
        <Stat label="Database drafts" value={stats.catalogue.byStatus.draft} hint={`${stats.catalogue.databaseTotal} DB tool${stats.catalogue.databaseTotal === 1 ? '' : 's'} · ${stats.catalogue.fromSubmissions} from approval`} to="/admin/tools" />
        <Stat label={`Decisions · ${stats.moderation.windowDays}d`} value={stats.moderation.decisions} hint="Approve, reject, request changes" to="/admin/audit" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Recent moderation activity"
          flush
          actions={
            <Link to="/admin/audit" className="font-mono text-[11.5px] text-[#cbbaff] hover:text-ink">
              Full audit log →
            </Link>
          }
        >
          {stats.recentActivity.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Quiet so far">No moderation or admin actions yet.</EmptyState>
            </div>
          ) : (
            <div className="[&>ol]:rounded-none [&>ol]:border-0">
              <AuditList entries={stats.recentActivity} />
            </div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Quick actions" flush>
            <ul className="divide-y divide-white/[0.05]">
              {QUICK_ACTIONS.map((action) => (
                <li key={action.to}>
                  <Link to={action.to} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-100 hover:bg-white/[0.03]">
                    <span className="min-w-0">
                      <span className="block text-[13px] text-ink">{action.label}</span>
                      <span className="block text-[11.5px] text-[#7f7a95]">{action.hint}</span>
                    </span>
                    <span aria-hidden="true" className="font-mono text-[12px] text-[#5e5a72]">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={`Submissions by status · ${stats.submissions.total}`}>
            {statusRows.length === 0 ? (
              <p className="text-[12.5px] text-[#7f7a95]">No submissions yet.</p>
            ) : (
              <Breakdown label="Submissions by status" rows={statusRows} total={stats.submissions.total} render={(status) => ADMIN_STATUS_LABEL[status]} />
            )}
          </Panel>
          <Panel title={`Accounts by role · ${stats.users.total}`}>
            <Breakdown label="Accounts by role" rows={roleRows} total={stats.users.total} render={(role) => <RoleBadge role={role} />} />
          </Panel>
        </div>
      </div>

      <p className="font-mono text-[11px] text-[#5e5a72]">Figures as of {formatDateTime(stats.generatedAt)}.</p>
    </div>
  )
}

export default function AdminDashboardPage() {
  useDocumentMeta(adminHead('Overview'))
  const { state, reload } = useAdminResource((signal) => fetchAdminStats(signal), [])
  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: 'Admin' }, { label: 'Overview' }]}
        title="System overview"
        subtitle="Moderation queue, catalogue and accounts at a glance."
        actions={
          <>
            <AdminButton variant="primary" to="/admin/submissions?status=SUBMITTED,UNDER_REVIEW">
              Review queue
            </AdminButton>
            <AdminButton to="/admin/audit">Audit log</AdminButton>
          </>
        }
      />
      <div className="mt-6">
        <ResourceView state={state} onRetry={reload} what="statistics">
          {(stats) => <Overview stats={stats} />}
        </ResourceView>
      </div>
    </>
  )
}
