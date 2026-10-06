import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireAuth from '@/components/auth/RequireAuth'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { fetchMySubmissions } from '@/services/auth'
import { ApiRequestError } from '@/services/http'
import type { OwnerSubmission } from '@/types/auth'
import { isAdminRole } from '@/utils/adminFormat'
import { accountHead, formatDate, SUBMISSION_STATUS_COPY } from '@/utils/submissionStatus'

/*
 * /account/submissions — "My submissions".
 *
 * GET /api/me/submissions returns only the signed-in user's own rows (the
 * server scopes by session; nothing here sends an id). Each row links to its
 * status page.
 */

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; items: OwnerSubmission[] }
  | { status: 'error'; message: string }

function SubmissionList() {
  const { logout, state: auth } = useAuth()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchMySubmissions(controller.signal).then(
      (items) => setLoad({ status: 'ready', items }),
      (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoad({
          status: 'error',
          message: error instanceof ApiRequestError ? error.message : 'Could not load your submissions.',
        })
      },
    )
    return () => controller.abort()
  }, [])

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">Account</p>
          <h1 className="mt-3 text-[clamp(30px,4vw,40px)] font-bold tracking-[-0.04em] text-ink">My submissions</h1>
          {auth.status === 'authenticated' && (
            <p className="mt-2 text-[14px] text-muted-dim">Signed in as {auth.user.email}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {/* The admin area's entry point. Shown by role for convenience; the server guards /api/admin itself. */}
          {auth.status === 'authenticated' && isAdminRole(auth.user.role) && (
            <Button to="/admin" variant="outline">
              Admin
            </Button>
          )}
          <Button to="/submit" variant="outline">
            Submit a tool
          </Button>
          <Button variant="subtle" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="mt-8">
        {load.status === 'loading' && <p role="status" className="text-[14.5px] text-muted-dim">Loading your submissions…</p>}
        {load.status === 'error' && (
          <p role="alert" className="text-[14.5px] text-pink">
            {load.message}
          </p>
        )}
        {load.status === 'ready' && load.items.length === 0 && (
          <p className="text-[14.5px] text-muted-dim">
            You haven’t submitted a tool yet.{' '}
            <Link to="/submit" className="font-semibold text-accent hover:text-ink">
              Submit your first one
            </Link>
            .
          </p>
        )}
        {load.status === 'ready' && load.items.length > 0 && (
          <ul aria-label="Your submissions" className="flex flex-col divide-y divide-hairline rounded-panel border border-hairline">
            {load.items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/account/submissions/${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04]"
                >
                  <span className="flex flex-col">
                    <span className="text-[15.5px] font-semibold text-ink">{item.name}</span>
                    <span className="text-[12.5px] text-muted-dim">
                      Submitted {formatDate(item.submittedAt)} · Updated {formatDate(item.updatedAt)}
                    </span>
                  </span>
                  <span className="rounded-tag bg-accent-wash-strong px-[10px] py-[5px] text-[11px] font-bold tracking-[0.05em] uppercase text-accent">
                    {SUBMISSION_STATUS_COPY[item.status]?.label ?? item.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default function AccountSubmissionsPage() {
  useDocumentMeta(accountHead('My submissions', 'Your AI Tool Kart submissions and their review status.'))
  return (
    <section className="relative mx-auto max-w-site px-8 pt-16 pb-[88px]">
      <div className="mx-auto max-w-[760px]">
        <RequireAuth>
          <SubmissionList />
        </RequireAuth>
      </div>
    </section>
  )
}
