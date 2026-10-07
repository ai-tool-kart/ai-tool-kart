import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import StatusBadge, { RoleBadge } from '@/components/admin/AdminBadges'
import AdminButton from '@/components/admin/AdminButton'
import { AdminField } from '@/components/admin/AdminControls'
import { AdminPageHeader, Facts, Notice, Panel, ResourceView } from '@/components/admin/AdminStates'
import ApprovalForm from '@/components/admin/ApprovalForm'
import AuditList from '@/components/admin/AuditList'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { LABEL } from '@/components/admin/adminTheme'
import { describeError, useAdminResource, useSessionAwareAction } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { addSubmissionNote, fetchAdminSubmission, rejectSubmission, requestSubmissionChanges } from '@/services/admin'
import { ApiRequestError } from '@/services/http'
import type { AdminSubmissionDetail, AuditEntry, ModerationAction } from '@/types/admin'
import { ADMIN_STATUS_LABEL, adminHead, formatDateTime } from '@/utils/adminFormat'

/*
 * /admin/submissions/:submissionId — one submission's review record.
 *
 * What the buttons offer comes from the server's `allowedActions`, and the
 * server checks the transition again under a row lock, so a stale page can
 * at worst get a 409 — which reloads the record and says why.
 *
 * Approve, reject and request-changes each go through a confirmation. A
 * reason is required before reject / request-changes can be confirmed, and
 * every button is disabled while a request is in flight.
 */

const REASON_MIN = 10
const REASON_MAX = 2000
const NOTE_MAX = 4000

type Decision = 'reject' | 'requestChanges'

const ACTION_LABEL: Record<ModerationAction, string> = { approve: 'approve', requestChanges: 'request changes', reject: 'reject', note: 'note' }

type Feedback = { tone: 'success' | 'error'; message: string } | null

function toEntries(submission: AdminSubmissionDetail): AuditEntry[] {
  return [...submission.events].reverse().map((event) => ({ ...event, kind: 'submission', submission: null, tool: null, targetUser: null }))
}

function Faqs({ faqs }: { faqs: unknown }) {
  if (!Array.isArray(faqs) || faqs.length === 0) return <span className="text-[#5e5a72]">—</span>
  return (
    <ul className="flex flex-col gap-2">
      {faqs.map((faq, index) => {
        const item = faq as { question?: unknown; answer?: unknown }
        return (
          <li key={index}>
            <p className="font-medium text-ink">{String(item.question ?? '')}</p>
            <p className="text-[#b4b0c4]">{String(item.answer ?? '')}</p>
          </li>
        )
      })}
    </ul>
  )
}

function Prose({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className="mt-1 text-[13.5px] leading-[1.65] break-words whitespace-pre-line text-ink">{children}</p>
    </div>
  )
}

function NoteForm({ onAdd, busy }: { onAdd: (note: string) => Promise<boolean>; busy: boolean }) {
  const [note, setNote] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (await onAdd(note.trim())) setNote('')
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <AdminField
        label="Add an internal note"
        name="note"
        textarea
        rows={3}
        value={note}
        onChange={setNote}
        maxLength={NOTE_MAX}
        hint="Only admins see notes. They are never shown to the submitter."
      />
      <div>
        <AdminButton type="submit" disabled={busy || note.trim() === ''}>
          {busy ? 'Saving…' : 'Add note'}
        </AdminButton>
      </div>
    </form>
  )
}

function Review({ submission, onChange, onConflict }: { submission: AdminSubmissionDetail; onChange: (next: AdminSubmissionDetail) => void; onConflict: () => void }) {
  const run = useSessionAwareAction()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [dialog, setDialog] = useState<Decision | null>(null)
  const [reason, setReason] = useState('')
  const [approving, setApproving] = useState(false)

  const can = (action: string) => submission.allowedActions.includes(action as never)
  const decided = !can('approve') && !can('reject')

  const perform = async (action: () => Promise<AdminSubmissionDetail>, success: string): Promise<boolean> => {
    setBusy(true)
    setFeedback(null)
    try {
      onChange(await run(action))
      setFeedback({ tone: 'success', message: success })
      return true
    } catch (error) {
      setFeedback({ tone: 'error', message: describeError(error, 'The action did not go through. Try again.') })
      // Someone else decided first: show the record as it is now.
      if (error instanceof ApiRequestError && error.status === 409 && error.code === 'CONFLICT') onConflict()
      return false
    } finally {
      setBusy(false)
    }
  }

  const confirmDecision = async () => {
    const text = reason.trim()
    const ok =
      dialog === 'reject'
        ? await perform(() => rejectSubmission(submission.id, text), 'Submission rejected. The submitter can see your reason.')
        : await perform(() => requestSubmissionChanges(submission.id, text), 'Changes requested. The submitter can see your message.')
    if (ok) setReason('')
    setDialog(null)
  }

  const reasonValid = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX
  const { catalogueTool, otherSubmissions } = submission.duplicates
  // The server reports any catalogue record at this address — including the
  // draft this very submission created on approval. That one is not a
  // duplicate, so it is not presented as one.
  const duplicate = catalogueTool && catalogueTool.id !== submission.toolId ? catalogueTool : null

  return (
    <div className="flex flex-col gap-5">
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}

      {duplicate && (
        <Notice tone="error">
          The catalogue already has a tool at this address:{' '}
          {duplicate.location === 'database' ? (
            <Link to={`/admin/tools/${duplicate.id}`} className="font-medium underline">
              {duplicate.name}
            </Link>
          ) : (
            <strong>{duplicate.name}</strong>
          )}
          {duplicate.location === 'live-catalogue' ? ' (live catalogue)' : ''}. Approving it would create a duplicate, so the server will
          refuse. Reject it as a duplicate instead.
        </Notice>
      )}
      {otherSubmissions.length > 0 && (
        <Notice tone="warn">
          This site was also submitted as:{' '}
          {otherSubmissions.map((other, index) => (
            <span key={other.id}>
              {index > 0 && ', '}
              <Link to={`/admin/submissions/${other.id}`} className="font-medium underline">
                {other.name}
              </Link>{' '}
              ({ADMIN_STATUS_LABEL[other.status]})
            </span>
          ))}
        </Notice>
      )}

      <Panel title="Moderation">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Decision">
            <AdminButton variant="primary" disabled={busy || !can('approve')} onClick={() => setApproving(true)}>
              Approve…
            </AdminButton>
            <AdminButton disabled={busy || !can('requestChanges')} onClick={() => setDialog('requestChanges')}>
              Request changes…
            </AdminButton>
            <AdminButton variant="danger" disabled={busy || !can('reject')} onClick={() => setDialog('reject')}>
              Reject…
            </AdminButton>
          </div>
          <p className="font-mono text-[11.5px] text-[#7f7a95]">
            {decided ? 'Decided — internal notes only.' : `Allowed: ${submission.allowedActions.filter((action) => action !== 'note').map((action) => ACTION_LABEL[action]).join(' · ')}`}
          </p>
        </div>
      </Panel>

      {approving && can('approve') && (
        <ApprovalForm
          submission={submission}
          busy={busy}
          onCancel={() => setApproving(false)}
          onApproved={(next) => {
            onChange(next)
            setApproving(false)
            setFeedback({ tone: 'success', message: `Approved. Draft catalogue record “${next.toolId}” created and the submitter made its owner.` })
          }}
          onError={(error) => {
            if (error instanceof ApiRequestError && error.status === 409 && error.code === 'CONFLICT' && !error.fields) {
              setApproving(false)
              setFeedback({ tone: 'error', message: error.message })
              onConflict()
            }
          }}
          setBusy={setBusy}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Submitted details">
            <Facts
              items={[
                [
                  'Website',
                  <a key="site" href={submission.siteUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[12.5px] break-all text-[#cbbaff] hover:text-ink">
                    {submission.siteUrl}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>,
                ],
                ['Category', submission.category],
                ['Pricing model', submission.pricingModel],
                ['Price', submission.price],
                ['Plan', submission.plan],
                ['Launch week', submission.launchWeekId],
                ['Audience', submission.audience],
                ['Tags', submission.tags.join(', ') || null],
                ['Alternatives', submission.alternatives.join(', ') || null],
                ['Source', submission.source === 'legacy_json' ? 'Legacy import' : 'Submit form'],
              ]}
            />
            <div className="mt-5 flex flex-col gap-4 border-t border-white/[0.06] pt-4">
              <Prose label="Description">{submission.description}</Prose>
              {submission.launchStory && <Prose label="Launch story">{submission.launchStory}</Prose>}
              <div>
                <p className={LABEL}>FAQs</p>
                <div className="mt-1 text-[13.5px]">
                  <Faqs faqs={submission.faqs} />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="History" flush>
            <div className="[&>ol]:rounded-none [&>ol]:border-0">
              <AuditList entries={toEntries(submission)} showSubject={false} />
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Submitter">
            {submission.submitter ? (
              <Facts
                items={[
                  [
                    'Account',
                    <Link key="account" to={`/admin/users/${submission.submitter.id}`} className="break-all text-[#cbbaff] hover:text-ink">
                      {submission.submitter.email}
                    </Link>,
                  ],
                  ['Name', submission.submitter.name],
                  ['Role', <RoleBadge key="role" role={submission.submitter.role} />],
                  ['Member since', formatDateTime(submission.submitter.createdAt)],
                ]}
              />
            ) : (
              <p className="text-[13px] text-[#8e88a8]">Anonymous — imported from the pre-account submission store.</p>
            )}
          </Panel>

          <Panel title="Review outcome">
            <Facts
              items={[
                ['Status', <StatusBadge key="status" status={submission.status} />],
                ['Reviewer', submission.reviewer ? submission.reviewer.name || submission.reviewer.email : null],
                ['Reviewed', submission.reviewedAt ? formatDateTime(submission.reviewedAt) : null],
                [
                  'Catalogue record',
                  submission.tool ? (
                    <Link key="tool" to={`/admin/tools/${submission.tool.id}`} className="text-[#cbbaff] hover:text-ink">
                      {submission.tool.name} <span className="font-mono text-[11.5px] text-[#7f7a95]">({submission.tool.status})</span>
                    </Link>
                  ) : null,
                ],
              ]}
            />
            {submission.ownerMessage && (
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <Prose label="Change request · visible to the submitter">{submission.ownerMessage}</Prose>
              </div>
            )}
            {submission.rejectionReason && (
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <Prose label="Rejection reason · visible to the submitter">{submission.rejectionReason}</Prose>
              </div>
            )}
          </Panel>

          <Panel title="Internal notes">
            <NoteForm busy={busy} onAdd={(note) => perform(() => addSubmissionNote(submission.id, note), 'Note added.')} />
          </Panel>
        </div>
      </div>

      {dialog && (
        <ConfirmDialog
          eyebrow={dialog === 'reject' ? 'Destructive decision' : 'Moderation decision'}
          title={dialog === 'reject' ? 'Reject this submission?' : 'Request changes?'}
          confirmLabel={dialog === 'reject' ? 'Reject submission' : 'Send change request'}
          destructive={dialog === 'reject'}
          busy={busy}
          confirmDisabled={!reasonValid}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmDecision()}
        >
          <p>
            {dialog === 'reject'
              ? 'The submission is kept for the record, but it will not enter the catalogue. The submitter will see your reason.'
              : 'The submitter will see your message on their submission page.'}
          </p>
          <AdminField
            label={dialog === 'reject' ? 'Reason' : 'What should change'}
            name="reason"
            textarea
            rows={4}
            required
            value={reason}
            onChange={setReason}
            maxLength={REASON_MAX}
            hint={`At least ${REASON_MIN} characters.`}
          />
        </ConfirmDialog>
      )}
    </div>
  )
}

export default function AdminSubmissionReviewPage() {
  const { submissionId = '' } = useParams()
  useDocumentMeta(adminHead('Review submission'))
  const { state, reload, setData } = useAdminResource((signal) => fetchAdminSubmission(submissionId, signal), [submissionId])

  return (
    <ResourceView state={state} onRetry={reload} what="submission">
      {(submission) => (
        <>
          <AdminPageHeader
            crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Submissions', to: '/admin/submissions' }, { label: 'Review' }]}
            title={submission.name}
            subtitle={submission.tagline}
            meta={
              <>
                <StatusBadge status={submission.status} />
                <span className="font-mono text-[11.5px] text-[#7f7a95]">
                  Submitted {formatDateTime(submission.submittedAt)} · Updated {formatDateTime(submission.updatedAt)}
                </span>
                <span className="font-mono text-[11px] text-[#5e5a72]">{submission.id}</span>
              </>
            }
          />
          <div className="mt-5">
            <Review submission={submission} onChange={setData} onConflict={reload} />
          </div>
        </>
      )}
    </ResourceView>
  )
}
