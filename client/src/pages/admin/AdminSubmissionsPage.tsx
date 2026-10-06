import { Link, useSearchParams } from 'react-router-dom'
import { FilterSelect, Pagination, SearchBox } from '@/components/admin/AdminControls'
import { EmptyState, PageTitle, ResourceView } from '@/components/admin/AdminStates'
import StatusBadge from '@/components/admin/StatusBadge'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminSubmissions } from '@/services/admin'
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
      <PageTitle title="Submissions" subtitle="Review what tool makers have submitted. Open one to approve, reject or request changes." />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onSearch={(value) => update({ q: value })} placeholder="Search name, URL or submitter email" label="Search submissions" />
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
      </div>

      <div className="mt-6">
        <ResourceView state={state} onRetry={reload} what="submissions">
          {(result) =>
            result.items.length === 0 ? (
              <EmptyState>{q || status ? 'No submissions match these filters.' : 'No submissions yet.'}</EmptyState>
            ) : (
              <>
                <ul aria-label="Submissions" className="flex flex-col divide-y divide-hairline rounded-panel border border-hairline">
                  {result.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={`/admin/submissions/${item.id}`}
                        className="grid grid-cols-1 items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04] md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto_auto]"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[15.5px] font-semibold text-ink">{item.name}</span>
                          <span className="truncate text-[12.5px] text-muted-dim">{item.siteUrl}</span>
                        </span>
                        <span className="min-w-0 truncate text-[13px] text-muted-soft">
                          {item.submitter ? item.submitter.name || item.submitter.email : 'Anonymous (legacy import)'}
                        </span>
                        <span className="text-[12.5px] text-muted-dim" title={formatDateTime(item.submittedAt)}>
                          {sortKey === 'updated' ? `Updated ${formatDate(item.updatedAt)}` : formatDate(item.submittedAt)}
                        </span>
                        <span className="justify-self-start md:justify-self-end">
                          <StatusBadge status={item.status} />
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
