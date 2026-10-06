import { useSearchParams } from 'react-router-dom'
import { FilterSelect, Pagination } from '@/components/admin/AdminControls'
import AuditList from '@/components/admin/AuditList'
import { EmptyState, PageTitle, ResourceView } from '@/components/admin/AdminStates'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAuditLog } from '@/services/admin'
import { adminHead } from '@/utils/adminFormat'

/*
 * /admin/audit — the merged, read-only audit timeline. Entries cannot be
 * edited or removed: the tables are append-only in the database and the API
 * has no route that would try.
 */

const PAGE_SIZE = 50

export default function AdminAuditPage() {
  useDocumentMeta(adminHead('Audit log'))
  const [params, setParams] = useSearchParams()
  const kind = (['submission', 'admin'] as const).find((value) => value === params.get('kind')) ?? 'all'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const { state, reload } = useAdminResource((signal) => fetchAuditLog({ page, pageSize: PAGE_SIZE, kind }, signal), [page, kind])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== 'all') next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  return (
    <>
      <PageTitle title="Audit log" subtitle="Every submission event and administrative action, newest first. Read-only." />
      <div className="mt-6 flex flex-wrap gap-3">
        <FilterSelect
          label="Show"
          value={kind}
          onChange={(value) => update({ kind: value })}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'submission', label: 'Submission events' },
            { value: 'admin', label: 'Catalogue and account changes' },
          ]}
        />
      </div>
      <div className="mt-6">
        <ResourceView state={state} onRetry={reload} what="audit entries">
          {(result) =>
            result.items.length === 0 ? (
              <EmptyState>Nothing recorded yet.</EmptyState>
            ) : (
              <>
                <AuditList entries={result.items} />
                <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPage={(next) => update({ page: String(next) })} />
              </>
            )
          }
        </ResourceView>
      </div>
    </>
  )
}
