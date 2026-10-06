import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AuditList from '@/components/admin/AuditList'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { EmptyState, Facts, Notice, PageTitle, Panel, ResourceView } from '@/components/admin/AdminStates'
import StatusBadge from '@/components/admin/StatusBadge'
import Button from '@/components/ui/Button'
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
    <div className="flex flex-col gap-4">
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Set role">
        {detail.assignableRoles.map((role) => (
          <Button key={role} variant={role === effective ? 'ghost' : 'subtle'} disabled={busy || role === effective} onClick={() => setPending(role)}>
            {ROLE_LABEL[role]}
          </Button>
        ))}
      </div>
      {pending && (
        <ConfirmDialog
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

function UserView({ detail, reload }: { detail: AdminUserDetail; reload: () => void }) {
  const { user } = detail
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Panel title="Submissions">
          {detail.submissions.length === 0 ? (
            <p className="text-[14px] text-muted-dim">No submissions.</p>
          ) : (
            <ul className="flex flex-col gap-3 text-[14px]">
              {detail.submissions.map((submission) => (
                <li key={submission.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/admin/submissions/${submission.id}`} className="text-accent hover:text-ink">
                    {submission.name}
                  </Link>
                  <StatusBadge status={submission.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Owned tools">
          {detail.ownedTools.length === 0 ? (
            <p className="text-[14px] text-muted-dim">Owns no tools.</p>
          ) : (
            <ul className="flex flex-col gap-3 text-[14px]">
              {detail.ownedTools.map((tool) => (
                <li key={tool.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/admin/tools/${tool.id}`} className="text-accent hover:text-ink">
                    {tool.name}
                  </Link>
                  <span className="text-[12.5px] text-muted-dim">since {formatDateTime(tool.ownerSince)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Role and ownership history">
          {detail.history.length === 0 ? <EmptyState>No admin changes to this account yet.</EmptyState> : <AuditList entries={detail.history} />}
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <Panel title="Account">
          <Facts
            items={[
              ['Role', ROLE_LABEL[user.role]],
              ['Name', user.name],
              ['Email verified', user.emailVerified ? 'Yes' : 'No'],
              ['Status', user.disabled ? 'Disabled' : 'Active'],
              ['Joined', formatDateTime(user.createdAt)],
              ['Last sign-in', user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null],
            ]}
          />
        </Panel>
        {detail.assignableRoles.length > 0 && (
          <Panel title="Change role">
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
    <>
      <Link to="/admin/users" className="text-[13.5px] font-medium text-muted-dim hover:text-ink">
        ← Users
      </Link>
      <div className="mt-4">
        <ResourceView state={state} onRetry={reload} what="user">
          {(detail) => (
            <>
              <PageTitle title={detail.user.email} subtitle={detail.user.name ?? undefined} />
              <div className="mt-6">
                <UserView detail={detail} reload={reload} />
              </div>
            </>
          )}
        </ResourceView>
      </div>
    </>
  )
}
