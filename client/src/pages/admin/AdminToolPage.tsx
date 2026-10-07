import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminField, AdminSelectField, CheckboxGroup } from '@/components/admin/AdminControls'
import AuditList from '@/components/admin/AuditList'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import StatusBadge, { Chip, RoleBadge } from '@/components/admin/AdminBadges'
import AdminButton from '@/components/admin/AdminButton'
import { AdminPageHeader, EmptyState, Facts, Notice, Panel, ResourceView } from '@/components/admin/AdminStates'
import { describeError, useAdminResource, useSessionAwareAction } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import {
  fetchAdminTool,
  fetchAdminUsers,
  fetchAdminVocabulary,
  grantToolOwnership,
  revokeToolOwnership,
  updateAdminTool,
} from '@/services/admin'
import { ApiRequestError } from '@/services/http'
import type { AdminToolDetail, AdminVocabulary } from '@/types/admin'
import { adminHead, formatDateTime } from '@/utils/adminFormat'
import { diffToolDraft, toolFieldErrors, toToolDraft, type ToolDraft } from '@/utils/adminForms'

/*
 * /admin/tools/:toolId — one catalogue record: what is stored, what breaks
 * the catalogue rules, who owns it, and its edit history.
 *
 * Saving sends ONLY the changed fields plus the updatedAt the form was
 * loaded with; the server refuses a stale save (409) rather than silently
 * overwriting someone else's edit. Identifiers, publication status and
 * editorial metrics are not editable here at all.
 */

const TEXT_FIELDS = [
  ['name', 'Name'],
  ['tagline', 'Tagline'],
  ['url', 'Website URL'],
  ['price', 'Price'],
  ['mono', 'Monogram'],
  ['api', 'API'],
  ['ctx', 'Context window'],
  ['team', 'Team plan'],
  ['trial', 'Trial'],
  ['integr', 'Integrations'],
] as const

function EditForm({
  detail,
  vocabulary,
  onSaved,
  onConflict,
}: {
  detail: AdminToolDetail
  vocabulary: AdminVocabulary
  onSaved: (next: AdminToolDetail) => void
  onConflict: (message: string) => void
}) {
  const run = useSessionAwareAction()
  const original = toToolDraft(detail.tool)
  const [draft, setDraft] = useState<ToolDraft>(original)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const changes = diffToolDraft(original, draft)
  const changed = Object.keys(changes)

  const set = <K extends keyof ToolDraft>(key: K, value: ToolDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const save = async () => {
    setBusy(true)
    setFeedback(null)
    try {
      const next = await run(() => updateAdminTool(detail.tool.id, detail.meta.updatedAt, changes))
      setErrors({})
      setConfirming(false)
      // The parent re-keys this form on the new updatedAt and shows the confirmation.
      onSaved(next)
    } catch (error) {
      setConfirming(false)
      if (error instanceof ApiRequestError && error.fields) {
        setErrors(toolFieldErrors(error.fields))
      }
      setFeedback({ tone: 'error', message: describeError(error, 'Could not save. Try again.') })
      if (error instanceof ApiRequestError && error.code === 'CONFLICT') onConflict(error.message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (changed.length > 0) setConfirming(true)
  }

  return (
    <form onSubmit={submit} aria-label="Edit tool" className="flex flex-col gap-5">
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}
      <div className="grid gap-5 sm:grid-cols-2">
        {TEXT_FIELDS.map(([key, label]) => (
          <AdminField key={key} label={label} name={key} value={draft[key]} onChange={(value) => set(key, value)} error={errors[key]} />
        ))}
        <AdminSelectField label="Category" value={draft.cat} options={vocabulary.categories} onChange={(value) => set('cat', value)} error={errors.cat} />
        <AdminSelectField
          label="Pricing tier"
          value={draft.pricingTier}
          options={vocabulary.pricingTiers}
          onChange={(value) => {
            // Keep the pair legal: a tier change picks that tier's first display model.
            const models = vocabulary.pricingModelsByTier[value] ?? []
            setDraft((current) => ({ ...current, pricingTier: value, model: models.includes(current.model) ? current.model : (models[0] ?? current.model) }))
          }}
          error={errors.pricingTier}
        />
        <AdminSelectField
          label="Pricing model"
          value={draft.model}
          options={vocabulary.pricingModelsByTier[draft.pricingTier] ?? vocabulary.pricingModels}
          onChange={(value) => set('model', value)}
          error={errors.model}
        />
      </div>
      <AdminField label="Plain line" name="plainLine" value={draft.plainLine} onChange={(value) => set('plainLine', value)} hint="Optional. Leave empty to remove." error={errors.plainLine} />
      <AdminField label="Summary" name="summary" textarea rows={4} value={draft.summary} onChange={(value) => set('summary', value)} maxLength={vocabulary.toolFields.summaryMaxChars} error={errors.summary} />
      <AdminField label="Tags" name="tags" value={draft.tags} onChange={(value) => set('tags', value)} hint="Comma-separated." error={errors.tags} />
      <CheckboxGroup name="roles" legend="Roles" options={vocabulary.roles} value={draft.roles} onChange={(value) => set('roles', value)} error={errors.roles} />
      <CheckboxGroup name="stages" legend="Workflow stages" options={vocabulary.stages} value={draft.stages} onChange={(value) => set('stages', value)} error={errors.stages} />
      <CheckboxGroup name="useCases" legend="Use cases" options={vocabulary.useCases} value={draft.useCases} onChange={(value) => set('useCases', value)} error={errors.useCases} />
      <div className="flex flex-wrap gap-6 text-[13px] text-ink">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-[#b49bff]" checked={draft.verified} onChange={(event) => set('verified', event.target.checked)} /> Verified
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-[#b49bff]" checked={draft.isMcpServer} onChange={(event) => set('isMcpServer', event.target.checked)} /> Ships an MCP server
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton variant="primary" type="submit" disabled={busy || changed.length === 0}>
          Save changes
        </AdminButton>
        <AdminButton
          variant="ghost"
          disabled={busy || changed.length === 0}
          onClick={() => {
            setDraft(original)
            setErrors({})
          }}
        >
          Discard
        </AdminButton>
        <span className="font-mono text-[11.5px] text-[#7f7a95]">{changed.length === 0 ? 'No unsaved changes.' : `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}.`}</span>
      </div>

      {confirming && (
        <ConfirmDialog eyebrow="Catalogue edit · audited" title="Save these changes?" confirmLabel="Save" busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void save()}>
          <p>
            Changing <strong className="text-ink">{changed.join(', ')}</strong> on {detail.tool.name}. The edit is recorded in the audit log with
            the previous values.
          </p>
        </ConfirmDialog>
      )}
    </form>
  )
}

function Owners({ detail, onChanged }: { detail: AdminToolDetail; onChanged: () => void }) {
  const run = useSessionAwareAction()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<{ kind: 'grant' | 'revoke'; userId: string; email: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const find = async (event: FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    try {
      const wanted = email.trim().toLowerCase()
      const result = await run(() => fetchAdminUsers({ q: wanted, pageSize: 10 }))
      const match = result.items.find((user) => user.email === wanted)
      if (!match) return setFeedback({ tone: 'error', message: 'No account with that exact email.' })
      setPending({ kind: 'grant', userId: match.id, email: match.email })
    } catch (error) {
      setFeedback({ tone: 'error', message: describeError(error, 'Could not look up that account.') })
    }
  }

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    try {
      if (pending.kind === 'grant') await run(() => grantToolOwnership(detail.tool.id, pending.userId))
      else await run(() => revokeToolOwnership(detail.tool.id, pending.userId))
      setFeedback({ tone: 'success', message: pending.kind === 'grant' ? `${pending.email} can now manage this tool.` : `${pending.email} no longer manages this tool.` })
      setEmail('')
      onChanged()
    } catch (error) {
      setFeedback({ tone: 'error', message: describeError(error, 'Could not change ownership.') })
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}
      {detail.owners.length === 0 ? (
        <p className="text-[13px] text-[#8e88a8]">Nobody manages this tool yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 text-[14px]">
          {detail.owners.map((owner) => (
            <li key={owner.userId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                <Link to={`/admin/users/${owner.userId}`} className="break-all text-[13px] text-[#cbbaff] hover:text-ink">
                  {owner.email}
                </Link>
                <span className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#7f7a95]">
                  <RoleBadge role={owner.role} /> since {formatDateTime(owner.ownerSince)}
                </span>
              </span>
              <AdminButton variant="danger" disabled={busy} onClick={() => setPending({ kind: 'revoke', userId: owner.userId, email: owner.email })}>
                Remove
              </AdminButton>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={find} className="flex flex-col gap-3">
        <AdminField label="Add an owner by email" name="ownerEmail" type="email" value={email} onChange={setEmail} placeholder="name@example.com" />
        <div>
          <AdminButton type="submit" disabled={busy || email.trim() === ''}>
            Find account
          </AdminButton>
        </div>
      </form>
      {pending && (
        <ConfirmDialog
          eyebrow="Ownership change · audited"
          title={pending.kind === 'grant' ? 'Grant ownership?' : 'Remove ownership?'}
          confirmLabel={pending.kind === 'grant' ? 'Grant ownership' : 'Remove owner'}
          destructive={pending.kind === 'revoke'}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        >
          <p>
            {pending.kind === 'grant'
              ? `${pending.email} will be able to manage ${detail.tool.name}.`
              : `${pending.email} will no longer be able to manage ${detail.tool.name}.`}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function ToolView({ detail, onChange, reload }: { detail: AdminToolDetail; onChange: (next: AdminToolDetail) => void; reload: () => void }) {
  const vocabulary = useAdminResource((signal) => fetchAdminVocabulary(signal), [])
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const { tool, meta, liveCatalogue } = detail
  return (
    <div className="flex flex-col gap-5">
      {notice && <Notice tone={notice.tone}>{notice.message}</Notice>}
      {!liveCatalogue.present && (
        <Notice>This record is not in the live catalogue, so visitors do not see it.</Notice>
      )}
      {liveCatalogue.present && !liveCatalogue.matchesDatabase && (
        <Notice tone="warn">The live catalogue serves a different version of this record. Edits saved here are not live yet.</Notice>
      )}
      {detail.issues.length > 0 && (
        <Notice tone="error">
          <p className="font-semibold">This stored record breaks {detail.issues.length} catalogue rule{detail.issues.length === 1 ? '' : 's'}:</p>
          <ul className="mt-1 list-disc pl-5">
            {detail.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p className="mt-1">Fix them in the form below; a save must leave the whole record valid.</p>
        </Notice>
      )}
      {detail.possibleDuplicates.length > 0 && (
        <Notice>
          Possible duplicate{detail.possibleDuplicates.length === 1 ? '' : 's'} (same name):{' '}
          {detail.possibleDuplicates.map((dup, index) => (
            <span key={dup.id}>
              {index > 0 && ', '}
              <Link to={`/admin/tools/${dup.id}`} className="font-medium underline">
                {dup.name}
              </Link>
            </span>
          ))}
          . Nothing is merged or removed automatically.
        </Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Edit record">
            <ResourceView state={vocabulary.state} onRetry={vocabulary.reload} what="vocabulary">
              {(vocab) => (
                <EditForm
                  key={meta.updatedAt}
                  detail={detail}
                  vocabulary={vocab}
                  onSaved={(next) => {
                    setNotice({ tone: 'success', message: 'Saved. The change is recorded in the audit log.' })
                    onChange(next)
                  }}
                  onConflict={(message) => {
                    setNotice({ tone: 'error', message: `${message} The form now shows the latest saved version.` })
                    reload()
                  }}
                />
              )}
            </ResourceView>
          </Panel>
          <Panel title="History" flush>
            {detail.history.length === 0 ? (
              <div className="p-4">
                <EmptyState>No admin changes recorded yet.</EmptyState>
              </div>
            ) : (
              <div className="[&>ol]:rounded-none [&>ol]:border-0">
                <AuditList entries={detail.history} showSubject={false} />
              </div>
            )}
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Record">
            <Facts
              items={[
                ['Id / slug', <span key="id" className="font-mono text-[13px]">{tool.id}</span>],
                ['Status', <Chip key="status" tone={tool.status === 'active' ? 'ok' : 'neutral'}>{tool.status}</Chip>],
                ['Source', meta.source === 'submission' ? 'Approved submission' : 'Seed catalogue'],
                ['Added', tool.addedAt ?? null],
                ['Created', formatDateTime(meta.createdAt)],
                ['Last saved', formatDateTime(meta.updatedAt)],
              ]}
            />
          </Panel>
          <Panel title="Owners">
            <Owners detail={detail} onChanged={reload} />
          </Panel>
          <Panel title="Submissions">
            {detail.submissions.length === 0 ? (
              <p className="text-[13px] text-[#8e88a8]">No submissions are linked to this tool.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-[14px]">
                {detail.submissions.map((submission) => (
                  <li key={submission.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/admin/submissions/${submission.id}`} className="text-[13px] text-[#cbbaff] hover:text-ink">
                      {submission.name}
                    </Link>
                    <StatusBadge status={submission.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

export default function AdminToolPage() {
  const { toolId = '' } = useParams()
  useDocumentMeta(adminHead('Tool'))
  const { state, reload, setData } = useAdminResource((signal) => fetchAdminTool(toolId, signal), [toolId])
  return (
    <ResourceView state={state} onRetry={reload} what="tool">
      {(detail) => (
        <>
          <AdminPageHeader
            crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Tools', to: '/admin/tools' }, { label: detail.tool.id }]}
            title={detail.tool.name}
            subtitle={detail.tool.tagline}
            meta={
              <>
                <Chip tone={detail.tool.status === 'active' ? 'ok' : 'neutral'}>{detail.tool.status}</Chip>
                <Chip tone={detail.liveCatalogue.present ? 'ok' : 'warn'}>{detail.liveCatalogue.present ? 'In live catalogue' : 'Not live'}</Chip>
                <span className="font-mono text-[11.5px] text-[#7f7a95]">Last saved {formatDateTime(detail.meta.updatedAt)}</span>
              </>
            }
          />
          <div className="mt-5">
            <ToolView detail={detail} onChange={setData} reload={reload} />
          </div>
        </>
      )}
    </ResourceView>
  )
}
