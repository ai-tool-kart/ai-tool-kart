import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import StatusBadge, { Chip, RoleBadge } from '@/components/admin/AdminBadges'
import AdminButton from '@/components/admin/AdminButton'
import { AdminPageHeader, EmptyState, Facts, Notice, Panel, ResourceView } from '@/components/admin/AdminStates'
import AuditList from '@/components/admin/AuditList'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { describeError, useAdminResource, useSessionAwareAction } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminUser, setUserRole } from '@/services/admin'
import type { AdminUserDetail } from '@/types/admin'
import type { UserRole } from '@/types/auth'
import { adminHead, formatDateTime, ROLE_LABEL } from '@/utils/adminFormat'

/*
 * /admin/users/:userId — one account.
 *
 * The role control appears only when the server says this admin may use it
 * (`assignableRoles`: a SUPER_ADMIN looking at someone else). That is a
 * courtesy; PATCH /admin/users/:id/role enforces every rule itself —
 * SUPER_ADMIN only, never your own role, never the last super admin.
 */

const ROLE_HELP: Partial<Record<UserRole, string>> = {
  USER: 'A regular account. Becomes Tool owner automatically while they own tools.',
  ADMIN: 'Can moderate submissions, edit the catalogue and manage ownership.',
  SUPER_ADMIN: 'Everything an admin can do, plus changing roles.',
}

function RoleControl({ detail, onChanged }: { detail: AdminUserDetail; onChanged: () => void }) {
  const run = useSessionAwareAction()
  const [pending, setPending] = useState<UserRole | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const current = detail.user.role
  // TOOL_OWNER is derived from ownership; "User" is how it is lowered.
  const effective: UserRole = current === 'TOOL_OWNER' ? 'USER' : current

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const updated = await run(() => setUserRole(detail.user.id, pending))
      setFeedback({ tone: 'success', message: `Role is now ${ROLE_LABEL[updated.role]}.` })
      onChanged()
    } catch (error) {
      setFeedback({ tone: 'error', message: describeError(error, 'Could not change the role.') })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-[1.55] text-[#8e88a8]">
        Changes are applied and re-checked by the server, recorded in the audit log, and lowering a role signs the person out everywhere.
        Tool owner follows tool ownership and is not set here.
      </p>
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Set role">
        {detail.assignableRoles.map((role) => (
          <AdminButton
            key={role}
            variant={role === effective ? 'secondary' : 'ghost'}
            pressed={role === effective}
            disabled={busy || role === effective}
            onClick={() => setPending(role)}
          >
            {ROLE_LABEL[role]}
            {role === effective && (
              <span aria-hidden="true" className="font-mono text-[10.5px] text-[#7f7a95]">
                current
              </span>
            )}
          </AdminButton>
        ))}
      </div>
      {pending && (
        <ConfirmDialog
          eyebrow="Privileged operation · audited"
          title={`Make ${detail.user.email} ${ROLE_LABEL[pending].toLowerCase()}?`}
          confirmLabel="Change role"
          destructive={pending === 'USER'}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        >
          <p>{ROLE_HELP[pending]}</p>
          {pending === 'USER' && <p>Lowering a role signs the person out everywhere.</p>}
          {pending === 'SUPER_ADMIN' && <p>Super admins can change anyone’s role, including yours.</p>}
        </ConfirmDialog>
      )}
    </div>
  )
}

function LinkList({ items, empty }: { items: { key: string; to: string; label: string; aside: ReactNode }[]; empty: string }) {
  if (items.length === 0) return <p className="text-[13px] text-[#8e88a8]">{empty}</p>
  return (
    <ul className="divide-y divide-white/[0.05]">
      {items.map((item) => (
        <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
          <Link to={item.to} className="min-w-0 truncate text-[13px] text-[#cbbaff] hover:text-ink">
            {item.label}
          </Link>
          {item.aside}
        </li>
      ))}
    </ul>
  )
}

function UserView({ detail, reload }: { detail: AdminUserDetail; reload: () => void }) {
  const { user } = detail
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Submissions">
          <LinkList
            empty="No submissions."
            items={detail.submissions.map((submission) => ({
              key: submission.id,
              to: `/admin/submissions/${submission.id}`,
              label: submission.name,
              aside: <StatusBadge status={submission.status} />,
            }))}
          />
        </Panel>
        <Panel title="Owned tools">
          <LinkList
            empty="Owns no tools."
            items={detail.ownedTools.map((tool) => ({
              key: tool.id,
              to: `/admin/tools/${tool.id}`,
              label: tool.name,
              aside: <span className="font-mono text-[11px] text-[#7f7a95]">since {formatDateTime(tool.ownerSince)}</span>,
            }))}
          />
        </Panel>
        <Panel title="Role and ownership history" flush>
          {detail.history.length === 0 ? (
            <div className="p-4">
              <EmptyState>No admin changes to this account yet.</EmptyState>
            </div>
          ) : (
            <div className="[&>ol]:rounded-none [&>ol]:border-0">
              <AuditList entries={detail.history} />
            </div>
          )}
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Account">
          <Facts
            items={[
              ['Role', <RoleBadge key="role" role={user.role} />],
              ['Name', user.name],
              ['Email verified', user.emailVerified ? 'Yes' : 'No'],
              ['Status', user.disabled ? <Chip key="status" tone="danger">Disabled</Chip> : <Chip key="status" tone="ok">Active</Chip>],
              ['Joined', formatDateTime(user.createdAt)],
              ['Last sign-in', user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null],
            ]}
          />
        </Panel>
        {detail.assignableRoles.length > 0 && (
          <Panel title="Privileged operation · Super admin" actions={<Chip tone="warn">Change role</Chip>}>
            <RoleControl detail={detail} onChanged={reload} />
          </Panel>
        )}
      </div>
    </div>
  )
}

export default function AdminUserPage() {
  const { userId = '' } = useParams()
  useDocumentMeta(adminHead('User'))
  const { state, reload } = useAdminResource((signal) => fetchAdminUser(userId, signal), [userId])
  return (
    <ResourceView state={state} onRetry={reload} what="user">
      {(detail) => (
        <>
          <AdminPageHeader
            crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Users', to: '/admin/users' }, { label: 'User' }]}
            title={detail.user.email}
            subtitle={detail.user.name ?? undefined}
            meta={
              <>
                <RoleBadge role={detail.user.role} />
                <span className="font-mono text-[11.5px] text-[#7f7a95]">
                  {detail.user.submissionCount} submission{detail.user.submissionCount === 1 ? '' : 's'} · {detail.user.ownedToolCount} tool
                  {detail.user.ownedToolCount === 1 ? '' : 's'}
                </span>
              </>
            }
          />
          <div className="mt-5">
            <UserView detail={detail} reload={reload} />
          </div>
        </>
      )}
    </ResourceView>
  )
}
