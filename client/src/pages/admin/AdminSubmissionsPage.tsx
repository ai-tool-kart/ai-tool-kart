import { useSearchParams } from 'react-router-dom'
import StatusBadge from '@/components/admin/AdminBadges'
import { FilterBar, FilterSelect, Pagination, SearchBox } from '@/components/admin/AdminControls'
import { AdminPageHeader, EmptyState, ResourceView } from '@/components/admin/AdminStates'
import AdminTable from '@/components/admin/AdminTable'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminSubmissions } from '@/services/admin'
import type { AdminSubmissionListItem } from '@/types/admin'
import { ADMIN_STATUS_LABEL, adminHead, formatDateTime, SUBMISSION_STATUSES } from '@/utils/adminFormat'
import { formatDate } from '@/utils/submissionStatus'

/*
 * /admin/submissions — the moderation queue.
 *
 * Filters live in the URL (?status=&q=&sort=&order=&page=) so a filtered
 * queue survives a refresh, a back button and a pasted link; the server
 * validates every one of them again.
 */

const PAGE_SIZE = 25

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'SUBMITTED,UNDER_REVIEW', label: 'Awaiting review' },
  ...SUBMISSION_STATUSES.map((status) => ({ value: status, label: ADMIN_STATUS_LABEL[status] })),
]

const SORT_OPTIONS = [
  { value: 'submitted:desc', label: 'Newest submitted' },
  { value: 'submitted:asc', label: 'Oldest submitted' },
  { value: 'updated:desc', label: 'Recently updated' },
  { value: 'updated:asc', label: 'Least recently updated' },
]

export default function AdminSubmissionsPage() {
  useDocumentMeta(adminHead('Submissions'))
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const q = params.get('q') ?? ''
  const sortKey = params.get('sort') === 'updated' ? 'updated' : 'submitted'
  const order = params.get('order') === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const { state, reload } = useAdminResource(
    (signal) =>
      fetchAdminSubmissions(
        { page, pageSize: PAGE_SIZE, q: q || undefined, status: status ? status.split(',') : undefined, sort: sortKey, order },
        signal,
      ),
    [page, q, status, sortKey, order],
  )

  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Submissions' }]}
        title="Submissions"
        subtitle="The moderation queue. Open a submission to approve, reject or request changes."
      />

      <div className="mt-5">
        <FilterBar>
          <SearchBox value={q} onSearch={(value) => update({ q: value })} placeholder="Name, URL or submitter email" label="Search submissions" />
          <FilterSelect label="Status" value={status} onChange={(value) => update({ status: value })} options={STATUS_OPTIONS} />
          <FilterSelect
            label="Sort"
            value={`${sortKey}:${order}`}
            onChange={(value) => {
              const [sort, direction] = value.split(':')
              update({ sort, order: direction })
            }}
            options={SORT_OPTIONS}
          />
        </FilterBar>
      </div>

      <div className="mt-4">
        <ResourceView state={state} onRetry={reload} what="submissions">
          {(result) =>
            result.items.length === 0 ? (
              <EmptyState title={q || status ? 'No matches' : 'Queue is empty'}>
                {q || status ? 'No submissions match these filters.' : 'No submissions yet. New ones appear here as tool makers submit them.'}
              </EmptyState>
            ) : (
              <>
                <AdminTable<AdminSubmissionListItem>
                  label="Submissions"
                  template="md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_130px_170px]"
                  rows={result.items}
                  rowKey={(item) => item.id}
                  rowHref={(item) => `/admin/submissions/${item.id}`}
                  columns={[
                    {
                      header: 'Submission',
                      render: (item) => (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13.5px] font-medium text-ink">{item.name}</span>
                          <span className="truncate font-mono text-[11.5px] text-[#7f7a95]">{item.siteUrl}</span>
                        </span>
                      ),
                    },
                    {
                      header: 'Submitter',
                      render: (item) => (
                        <span className="block truncate text-[12.5px] text-[#b4b0c4]">
                          {item.submitter ? item.submitter.name || item.submitter.email : 'Anonymous (legacy import)'}
                        </span>
                      ),
                    },
                    {
                      header: sortKey === 'updated' ? 'Updated' : 'Submitted',
                      render: (item) => (
                        <span className="font-mono text-[11.5px] text-[#8e88a8]" title={formatDateTime(sortKey === 'updated' ? item.updatedAt : item.submittedAt)}>
                          {sortKey === 'updated' ? `Updated ${formatDate(item.updatedAt)}` : formatDate(item.submittedAt)}
                        </span>
                      ),
                    },
                    { header: 'Status', className: 'md:text-right', render: (item) => <StatusBadge status={item.status} /> },
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
