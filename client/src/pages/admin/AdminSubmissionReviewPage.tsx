import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import ApprovalForm from '@/components/admin/ApprovalForm'
import AuditList from '@/components/admin/AuditList'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { Facts, Notice, PageTitle, Panel, ResourceView } from '@/components/admin/AdminStates'
import StatusBadge from '@/components/admin/StatusBadge'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import { describeError, useAdminResource, useSessionAwareAction } from '@/hooks/useAdminResource'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { addSubmissionNote, fetchAdminSubmission, rejectSubmission, requestSubmissionChanges } from '@/services/admin'
import { ApiRequestError } from '@/services/http'
import type { AdminSubmissionDetail, AuditEntry } from '@/types/admin'
import { ADMIN_STATUS_LABEL, adminHead, formatDateTime, ROLE_LABEL } from '@/utils/adminFormat'

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

type Feedback = { tone: 'success' | 'error'; message: string } | null

function toEntries(submission: AdminSubmissionDetail): AuditEntry[] {
  return [...submission.events].reverse().map((event) => ({ ...event, kind: 'submission', submission: null, tool: null, targetUser: null }))
}

function Faqs({ faqs }: { faqs: unknown }) {
  if (!Array.isArray(faqs) || faqs.length === 0) return <span>—</span>
  return (
    <ul className="flex flex-col gap-2">
      {faqs.map((faq, index) => {
        const item = faq as { question?: unknown; answer?: unknown }
        return (
          <li key={index}>
            <p className="font-semibold">{String(item.question ?? '')}</p>
            <p className="text-muted-soft">{String(item.answer ?? '')}</p>
          </li>
        )
      })}
    </ul>
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
      <FormField
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
        <Button type="submit" variant="subtle" disabled={busy || note.trim() === ''}>
          {busy ? 'Saving…' : 'Add note'}
        </Button>
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
    if (ok) {
      setDialog(null)
      setReason('')
    } else setDialog(null)
  }

  const reasonValid = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX
  const { catalogueTool, otherSubmissions } = submission.duplicates

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={submission.status} />
        <span className="text-[13px] text-muted-dim">
          Submitted {formatDateTime(submission.submittedAt)} · Updated {formatDateTime(submission.updatedAt)}
        </span>
      </div>

      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}

      {catalogueTool && (
        <Notice tone="error">
          The catalogue already has a tool at this address:{' '}
          {catalogueTool.location === 'database' ? (
            <Link to={`/admin/tools/${catalogueTool.id}`} className="font-semibold underline">
              {catalogueTool.name}
            </Link>
          ) : (
            <strong>{catalogueTool.name}</strong>
          )}
          {catalogueTool.location === 'live-catalogue' ? ' (live catalogue)' : ''}. Approving it would create a duplicate, so the server
          will refuse. Reject it as a duplicate instead.
        </Notice>
      )}
      {otherSubmissions.length > 0 && (
        <Notice>
          This site was also submitted as:{' '}
          {otherSubmissions.map((other, index) => (
            <span key={other.id}>
              {index > 0 && ', '}
              <Link to={`/admin/submissions/${other.id}`} className="font-semibold text-accent hover:text-ink">
                {other.name}
              </Link>{' '}
              ({ADMIN_STATUS_LABEL[other.status]})
            </span>
          ))}
        </Notice>
      )}

      <div className="flex flex-wrap gap-3" aria-label="Decision">
        <Button disabled={busy || !can('approve')} onClick={() => setApproving(true)}>
          Approve…
        </Button>
        <Button variant="outline" disabled={busy || !can('requestChanges')} onClick={() => setDialog('requestChanges')}>
          Request changes…
        </Button>
        <Button variant="subtle" disabled={busy || !can('reject')} onClick={() => setDialog('reject')}>
          Reject…
        </Button>
      </div>
      {!can('approve') && !can('reject') && (
        <p className="text-[13.5px] text-muted-dim">This submission has been decided. You can still add internal notes.</p>
      )}

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Submitted details">
            <Facts
              items={[
                [
                  'Website',
                  <a key="site" href={submission.siteUrl} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:text-ink">
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
                ['Tags', submission.tags.join(', ') || '—'],
                ['Alternatives', submission.alternatives.join(', ') || '—'],
                ['Source', submission.source === 'legacy_json' ? 'Legacy import' : 'Submit form'],
              ]}
            />
            <div className="mt-5 flex flex-col gap-4 text-[14px]">
              <div>
                <p className="text-subtle">Description</p>
                <p className="mt-1 leading-[1.6] whitespace-pre-line break-words text-ink">{submission.description}</p>
              </div>
              {submission.launchStory && (
                <div>
                  <p className="text-subtle">Launch story</p>
                  <p className="mt-1 leading-[1.6] whitespace-pre-line break-words text-ink">{submission.launchStory}</p>
                </div>
              )}
              <div>
                <p className="text-subtle">FAQs</p>
                <div className="mt-1 text-ink">
                  <Faqs faqs={submission.faqs} />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="History">
            <AuditList entries={toEntries(submission)} showSubject={false} />
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Submitter">
            {submission.submitter ? (
              <Facts
                items={[
                  [
                    'Account',
                    <Link key="account" to={`/admin/users/${submission.submitter.id}`} className="break-all text-accent hover:text-ink">
                      {submission.submitter.email}
                    </Link>,
                  ],
                  ['Name', submission.submitter.name],
                  ['Role', ROLE_LABEL[submission.submitter.role]],
                  ['Member since', formatDateTime(submission.submitter.createdAt)],
                ]}
              />
            ) : (
              <p className="text-[14px] text-muted-dim">Anonymous — imported from the pre-account submission store.</p>
            )}
          </Panel>

          <Panel title="Review outcome">
            <Facts
              items={[
                ['Status', ADMIN_STATUS_LABEL[submission.status]],
                ['Reviewer', submission.reviewer ? submission.reviewer.name || submission.reviewer.email : null],
                ['Reviewed', submission.reviewedAt ? formatDateTime(submission.reviewedAt) : null],
                [
                  'Catalogue record',
                  submission.tool ? (
                    <Link key="tool" to={`/admin/tools/${submission.tool.id}`} className="text-accent hover:text-ink">
                      {submission.tool.name} ({submission.tool.status})
                    </Link>
                  ) : null,
                ],
              ]}
            />
            {submission.ownerMessage && (
              <div className="mt-4 text-[14px]">
                <p className="text-subtle">Change request (visible to the submitter)</p>
                <p className="mt-1 whitespace-pre-line break-words text-ink">{submission.ownerMessage}</p>
              </div>
            )}
            {submission.rejectionReason && (
              <div className="mt-4 text-[14px]">
                <p className="text-subtle">Rejection reason (visible to the submitter)</p>
                <p className="mt-1 whitespace-pre-line break-words text-ink">{submission.rejectionReason}</p>
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
          <FormField
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
    <>
      <Link to="/admin/submissions" className="text-[13.5px] font-medium text-muted-dim hover:text-ink">
        ← Submissions
      </Link>
      <div className="mt-4">
        <ResourceView state={state} onRetry={reload} what="submission">
          {(submission) => (
            <>
              <PageTitle title={submission.name} subtitle={submission.tagline} />
              <div className="mt-6">
                <Review submission={submission} onChange={setData} onConflict={reload} />
              </div>
            </>
          )}
        </ResourceView>
      </div>
    </>
  )
}
