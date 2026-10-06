import { Link, useSearchParams } from 'react-router-dom'
import { FilterSelect, Pagination, SearchBox } from '@/components/admin/AdminControls'
import { EmptyState, Notice, PageTitle, ResourceView } from '@/components/admin/AdminStates'
import { useAdminResource } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchAdminTools, fetchAdminVocabulary } from '@/services/admin'
import { adminHead } from '@/utils/adminFormat'

/*
 * /admin/tools — the database catalogue. The note at the top is not
 * decoration: the public site still reads the bundled catalogue, so an edit
 * saved here is not live, and moderators must never be left to assume it is.
 */

const PAGE_SIZE = 25

export default function AdminToolsPage() {
  useDocumentMeta(adminHead('Catalogue'))
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const source = params.get('source') ?? ''
  const category = params.get('category') ?? ''
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
      <PageTitle title="Catalogue" subtitle="Review and correct catalogue records. Nothing is ever deleted here." />
      <div className="mt-5">
        <Notice>
          The public site still serves the bundled catalogue. Edits and approvals saved here update the database catalogue, which is not yet
          what visitors see. Each tool page shows whether its live record differs.
        </Notice>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onSearch={(value) => update({ q: value })} placeholder="Search name, id or URL" label="Search tools" />
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
            { value: 'submission', label: 'From a submission' },
          ]}
        />
      </div>

      <div className="mt-6">
        <ResourceView state={state} onRetry={reload} what="tools">
          {(result) =>
            result.items.length === 0 ? (
              <EmptyState>No tools match these filters.</EmptyState>
            ) : (
              <>
                <ul aria-label="Tools" className="flex flex-col divide-y divide-hairline rounded-panel border border-hairline">
                  {result.items.map((tool) => (
                    <li key={tool.id}>
                      <Link
                        to={`/admin/tools/${tool.id}`}
                        className="grid grid-cols-1 items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[15.5px] font-semibold text-ink">{tool.name}</span>
                          <span className="truncate font-mono text-[12px] text-muted-dim">{tool.id}</span>
                        </span>
                        <span className="text-[13px] text-muted-soft">
                          {tool.cat} · {tool.model}
                          {tool.ownerCount > 0 && ` · ${tool.ownerCount} owner${tool.ownerCount === 1 ? '' : 's'}`}
                        </span>
                        <span className="flex flex-wrap gap-2 md:justify-end">
                          {tool.issueCount > 0 && (
                            <span className="rounded-tag bg-pink-bg px-[10px] py-[5px] text-[11px] font-bold tracking-[0.05em] text-pink uppercase">
                              {tool.issueCount} issue{tool.issueCount === 1 ? '' : 's'}
                            </span>
                          )}
                          {tool.source === 'submission' && (
                            <span className="rounded-tag bg-white/[0.07] px-[10px] py-[5px] text-[11px] font-bold tracking-[0.05em] text-muted-soft uppercase">
                              Submitted
                            </span>
                          )}
                          <span
                            className={`rounded-tag px-[10px] py-[5px] text-[11px] font-bold tracking-[0.05em] uppercase ${
                              tool.status === 'active' ? 'bg-accent-wash-strong text-accent' : 'bg-white/[0.07] text-muted-soft'
                            }`}
                          >
                            {tool.status}
                          </span>
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
