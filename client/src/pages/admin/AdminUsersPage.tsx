import { Link, useSearchParams } from 'react-router-dom'
import { FilterSelect, Pagination, SearchBox } from '@/components/admin/AdminControls'
import { EmptyState, PageTitle, ResourceView } from '@/components/admin/AdminStates'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminUsers } from '@/services/admin'
import type { UserRole } from '@/types/auth'
import { adminHead, ROLE_LABEL } from '@/utils/adminFormat'
import { formatDate } from '@/utils/submissionStatus'

/* /admin/users — accounts, newest first. */

const PAGE_SIZE = 25
const ROLES = Object.keys(ROLE_LABEL) as UserRole[]

export default function AdminUsersPage() {
  useDocumentMeta(adminHead('Users'))
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const role = params.get('role') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const { state, reload } = useAdminResource(
    (signal) => fetchAdminUsers({ page, pageSize: PAGE_SIZE, q: q || undefined, role: role ? role.split(',') : undefined }, signal),
    [page, q, role],
  )

  return (
    <>
      <PageTitle title="Users" subtitle="Accounts, their roles, submissions and owned tools." />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onSearch={(value) => update({ q: value })} placeholder="Search email or name" label="Search users" />
        <FilterSelect
          label="Role"
          value={role}
          onChange={(value) => update({ role: value })}
          options={[
            { value: '', label: 'All roles' },
            { value: 'ADMIN,SUPER_ADMIN', label: 'Admins' },
            ...ROLES.map((value) => ({ value, label: ROLE_LABEL[value] })),
          ]}
        />
      </div>
      <div className="mt-6">
        <ResourceView state={state} onRetry={reload} what="users">
          {(result) =>
            result.items.length === 0 ? (
              <EmptyState>No accounts match these filters.</EmptyState>
            ) : (
              <>
                <ul aria-label="Users" className="flex flex-col divide-y divide-hairline rounded-panel border border-hairline">
                  {result.items.map((user) => (
                    <li key={user.id}>
                      <Link
                        to={`/admin/users/${user.id}`}
                        className="grid grid-cols-1 items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[15px] font-semibold text-ink">{user.email}</span>
                          <span className="truncate text-[12.5px] text-muted-dim">
                            {user.name ?? 'No name'} · joined {formatDate(user.createdAt)}
                            {user.disabled && ' · disabled'}
                          </span>
                        </span>
                        <span className="text-[13px] text-muted-soft">
                          {user.submissionCount} submission{user.submissionCount === 1 ? '' : 's'} · {user.ownedToolCount} tool
                          {user.ownedToolCount === 1 ? '' : 's'}
                        </span>
                        <span className="justify-self-start rounded-tag bg-accent-wash-strong px-[10px] py-[5px] text-[11px] font-bold tracking-[0.05em] text-accent uppercase md:justify-self-end">
                          {ROLE_LABEL[user.role]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPage={(next) => update({ page: String(next) })} />
              </>
            )
          }
        </ResourceView>
      </div>
    </>
  )
}
