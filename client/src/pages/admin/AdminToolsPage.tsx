import { useSearchParams } from 'react-router-dom'
import { Chip } from '@/components/admin/AdminBadges'
import AdminButton from '@/components/admin/AdminButton'
import { FilterBar, FilterSelect, Pagination, SearchBox } from '@/components/admin/AdminControls'
import { AdminPageHeader, EmptyState, Notice, ResourceView } from '@/components/admin/AdminStates'
import AdminTable from '@/components/admin/AdminTable'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminTools, fetchAdminVocabulary } from '@/services/admin'
import type { AdminToolListItem } from '@/types/admin'
import { adminHead } from '@/utils/adminFormat'

/*
 * /admin/tools — the database catalogue. The note at the top is not
 * decoration: the public site still reads the bundled catalogue, so a record
 * here (an approval's draft, an edit) is not live, and moderators must never
 * be left to assume it is. An empty list is a normal state: database tools
 * are created by approving submissions.
 */

const PAGE_SIZE = 25

export default function AdminToolsPage() {
  useDocumentMeta(adminHead('Tools'))
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const source = params.get('source') ?? ''
  const category = params.get('category') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const filtered = Boolean(q || status || source || category)

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const vocabulary = useAdminResource((signal) => fetchAdminVocabulary(signal), [])
  const categories = vocabulary.state.status === 'ready' ? vocabulary.state.data.categories : []
  const { state, reload } = useAdminResource(
    (signal) =>
      fetchAdminTools(
        {
          page,
          pageSize: PAGE_SIZE,
          q: q || undefined,
          status: status ? [status] : undefined,
          source: source ? [source] : undefined,
          category: category || undefined,
        },
        signal,
      ),
    [page, q, status, source, category],
  )

  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Tools' }]}
        title="Tools"
        subtitle="The database catalogue: review and correct records. Nothing is ever deleted here."
      />
      <div className="mt-5">
        <Notice>
          The public site still serves the bundled catalogue. Records here — approval drafts and edits — are not yet what visitors see.
          Each tool page shows whether its live record differs.
        </Notice>
      </div>

      <div className="mt-4">
        <FilterBar>
          <SearchBox value={q} onSearch={(value) => update({ q: value })} placeholder="Name, id or URL" label="Search tools" />
          <FilterSelect
            label="Category"
            value={category}
            onChange={(value) => update({ category: value })}
            options={[{ value: '', label: 'All categories' }, ...categories.map((name) => ({ value: name, label: name }))]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => update({ status: value })}
            options={[
              { value: '', label: 'Any status' },
              { value: 'active', label: 'Active' },
              { value: 'draft', label: 'Draft' },
            ]}
          />
          <FilterSelect
            label="Source"
            value={source}
            onChange={(value) => update({ source: value })}
            options={[
              { value: '', label: 'Any source' },
              { value: 'seed', label: 'Seed catalogue' },
              { value: 'submission', label: 'From approval' },
            ]}
          />
        </FilterBar>
      </div>

      <div className="mt-4">
        <ResourceView state={state} onRetry={reload} what="tools">
          {(result) =>
            result.items.length === 0 ? (
              filtered ? (
                <EmptyState title="No matches">No tools match these filters.</EmptyState>
              ) : (
                <EmptyState
                  title="No database tools yet"
                  action={
                    <AdminButton to="/admin/submissions?status=SUBMITTED,UNDER_REVIEW" variant="primary">
                      Open the review queue
                    </AdminButton>
                  }
                >
                  Draft tools appear here when a submission is approved. The public catalogue is served from the bundled catalogue and isn’t
                  listed here.
                </EmptyState>
              )
            ) : (
              <>
                <AdminTable<AdminToolListItem>
                  label="Tools"
                  template="md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_90px_minmax(0,1.2fr)]"
                  rows={result.items}
                  rowKey={(tool) => tool.id}
                  rowHref={(tool) => `/admin/tools/${tool.id}`}
                  columns={[
                    {
                      header: 'Tool',
                      render: (tool) => (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13.5px] font-medium text-ink">{tool.name}</span>
                          <span className="truncate font-mono text-[11.5px] text-[#7f7a95]">{tool.id}</span>
                        </span>
                      ),
                    },
                    {
                      header: 'Category',
                      render: (tool) => (
                        <span className="text-[12.5px] text-[#b4b0c4]">
                          {tool.cat} · {tool.model}
                        </span>
                      ),
                    },
                    {
                      header: 'Owners',
                      render: (tool) => (
                        <span className="font-mono text-[12px] text-[#b4b0c4]">
                          {tool.ownerCount}
                          <span className="text-[#5e5a72] md:hidden"> owner{tool.ownerCount === 1 ? '' : 's'}</span>
                        </span>
                      ),
                    },
                    {
                      header: 'State',
                      className: 'md:text-right',
                      render: (tool) => (
                        <span className="inline-flex flex-wrap gap-1.5 md:justify-end">
                          {tool.issueCount > 0 && (
                            <Chip tone="danger">
                              {tool.issueCount} issue{tool.issueCount === 1 ? '' : 's'}
                            </Chip>
                          )}
                          {tool.source === 'submission' && (
                            <Chip tone="info" dot={false}>
                              Via approval
                            </Chip>
                          )}
                          <Chip tone={tool.status === 'active' ? 'ok' : 'neutral'}>{tool.status}</Chip>
                        </span>
                      ),
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
