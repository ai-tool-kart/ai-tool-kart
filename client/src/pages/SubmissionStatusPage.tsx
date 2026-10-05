import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RequireAuth, { AccountMessage } from '@/components/auth/RequireAuth'
import SpotCard from '@/components/ui/SpotCard'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchMySubmission } from '@/services/auth'
import { ApiRequestError } from '@/services/http'
import type { OwnerSubmission } from '@/types/auth'
import { accountHead, formatDate, SUBMISSION_STATUS_COPY } from '@/utils/submissionStatus'

/*
 * /account/submissions/:id — one submission's status.
 *
 * Reads GET /api/me/submissions/:id, so a refresh works and the server decides
 * access: someone else's id, an unknown id and a malformed one all come back
 * as the same 404, and this page shows the same "not found" for all three.
 */

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; submission: OwnerSubmission }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

function SubmissionStatus({ id }: { id: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    fetchMySubmission(id, controller.signal).then(
      (submission) => setLoad({ status: 'ready', submission }),
      (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (error instanceof ApiRequestError && error.status === 404) return setLoad({ status: 'not-found' })
        setLoad({
          status: 'error',
          message: error instanceof ApiRequestError ? error.message : 'Could not load this submission.',
        })
      },
    )
    return () => controller.abort()
  }, [id])

  if (load.status === 'loading') return <AccountMessage title="Loading submission…" />
  if (load.status === 'not-found') {
    return (
      <AccountMessage title="Submission not found">
        <Link to="/account/submissions" className="font-semibold text-accent hover:text-ink">
          Back to My submissions
        </Link>
      </AccountMessage>
    )
  }
  if (load.status === 'error') return <AccountMessage title="Something went wrong">{load.message}</AccountMessage>

  const { submission } = load
  const copy = SUBMISSION_STATUS_COPY[submission.status]
  return (
    <>
      <Link to="/account/submissions" className="text-[13.5px] font-medium text-muted-dim hover:text-ink">
        ← My submissions
      </Link>
      <h1 className="mt-4 text-[clamp(30px,4vw,40px)] font-bold tracking-[-0.04em] text-ink">{submission.name}</h1>
      <p className="mt-2 text-[15px] text-muted-dim">{submission.tagline}</p>

      <SpotCard className="mt-8 rounded-panel p-7 sm:p-8">
        <div className="relative flex flex-col gap-5">
          <div>
            <p className="text-[13px] tracking-[0.05em] uppercase text-subtle">Status</p>
            <p className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">{copy?.label ?? submission.status}</p>
            {copy && <p className="mt-1 text-[14.5px] leading-[1.6] text-muted-dim">{copy.detail}</p>}
          </div>

          {submission.ownerMessage && (
            <div>
              <p className="text-[13px] tracking-[0.05em] uppercase text-subtle">Message from the reviewer</p>
              <p className="mt-2 text-[14.5px] leading-[1.6] whitespace-pre-line text-ink">{submission.ownerMessage}</p>
            </div>
          )}
          {submission.status === 'REJECTED' && submission.rejectionReason && (
            <div>
              <p className="text-[13px] tracking-[0.05em] uppercase text-subtle">Reason</p>
              <p className="mt-2 text-[14.5px] leading-[1.6] whitespace-pre-line text-ink">{submission.rejectionReason}</p>
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="text-subtle">Reference</dt>
              <dd className="font-mono text-[13px] break-all text-ink">{submission.id}</dd>
            </div>
            <div>
              <dt className="text-subtle">Website</dt>
              <dd className="break-all text-ink">{submission.siteUrl}</dd>
            </div>
            <div>
              <dt className="text-subtle">Submitted</dt>
              <dd className="text-ink">{formatDate(submission.submittedAt)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Last updated</dt>
              <dd className="text-ink">{formatDate(submission.updatedAt)}</dd>
            </div>
          </dl>
        </div>
      </SpotCard>
    </>
  )
}

export default function SubmissionStatusPage() {
  const { id = '' } = useParams()
  useDocumentMeta(accountHead('Submission status', 'The review status of your AI Tool Kart submission.'))
  return (
    <section className="relative mx-auto max-w-site px-8 pt-16 pb-[88px]">
      <div className="mx-auto max-w-[760px]">
        <RequireAuth>
          <SubmissionStatus id={id} />
        </RequireAuth>
      </div>
    </section>
  )
}
