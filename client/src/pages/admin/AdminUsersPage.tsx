import { useSearchParams } from 'react-router-dom'
import { Chip, RoleBadge } from '@/components/admin/AdminBadges'
import { FilterBar, FilterSelect, Pagination, SearchBox } from '@/components/admin/AdminControls'
import { AdminPageHeader, EmptyState, ResourceView } from '@/components/admin/AdminStates'
import AdminTable from '@/components/admin/AdminTable'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminUsers } from '@/services/admin'
import type { AdminUser } from '@/types/admin'
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
      <AdminPageHeader
        crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Users' }]}
        title="Users"
        subtitle="Accounts, their roles, submissions and owned tools."
      />
      <div className="mt-5">
        <FilterBar>
          <SearchBox value={q} onSearch={(value) => update({ q: value })} placeholder="Email or name" label="Search users" />
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
        </FilterBar>
      </div>
      <div className="mt-4">
        <ResourceView state={state} onRetry={reload} what="users">
          {(result) =>
            result.items.length === 0 ? (
              <EmptyState title="No matches">No accounts match these filters.</EmptyState>
            ) : (
              <>
                <AdminTable<AdminUser>
                  label="Users"
                  template="md:grid-cols-[minmax(0,2.2fr)_150px_110px_110px_150px]"
                  rows={result.items}
                  rowKey={(user) => user.id}
                  rowHref={(user) => `/admin/users/${user.id}`}
                  columns={[
                    {
                      header: 'Account',
                      render: (user) => (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13.5px] font-medium text-ink">{user.email}</span>
                          <span className="truncate text-[12px] text-[#7f7a95]">
                            {user.name ?? 'No name'}
                            {user.disabled && ' · disabled'}
                          </span>
                        </span>
                      ),
                    },
                    {
                      header: 'Role',
                      render: (user) => (
                        <span className="inline-flex flex-wrap gap-1.5">
                          <RoleBadge role={user.role} />
                          {user.disabled && <Chip tone="danger">Disabled</Chip>}
                        </span>
                      ),
                    },
                    {
                      header: 'Submissions',
                      render: (user) => (
                        <span className="font-mono text-[12px] text-[#b4b0c4]">
                          {user.submissionCount}
                          <span className="text-[#5e5a72] md:hidden"> submission{user.submissionCount === 1 ? '' : 's'}</span>
                        </span>
                      ),
                    },
                    {
                      header: 'Tools',
                      render: (user) => (
                        <span className="font-mono text-[12px] text-[#b4b0c4]">
                          {user.ownedToolCount}
                          <span className="text-[#5e5a72] md:hidden"> tool{user.ownedToolCount === 1 ? '' : 's'} owned</span>
                        </span>
                      ),
                    },
                    {
                      header: 'Joined',
                      render: (user) => <span className="font-mono text-[11.5px] text-[#8e88a8]">{formatDate(user.createdAt)}</span>,
                    },
                  ]}
                />
                <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPage={(next) => update({ page: String(next) })} />
              </>
            )
          }
        </ResourceView>
      </div>
    </>
  )
}
