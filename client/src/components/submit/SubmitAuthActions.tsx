import { Link } from 'react-router-dom'
import type { AuthMode } from '@/components/auth/AuthForm'
import Button from '@/components/ui/Button'
import { SUBMIT_ROUTE } from '@/data/navigation'
import type { AuthState } from '@/types/auth'

/*
 * The Submit page header's account actions — "Log in" and "Create account"
 * for a visitor, "You're signed in · My submissions" for a member (the
 * form's footer already names the account it submits as). Reads the page's
 * existing auth state (useAuth in SubmitPage); makes no request of its own.
 *
 * The listing lives only in the page's component state (see AuthGatePanel:
 * nothing is copied into browser storage). So:
 *   - untouched form → real links to /login and /register, returning here
 *     via ?next= (AuthPage honours same-site paths)
 *   - form with input → the same buttons open the page's inline sign-in
 *     gate instead, because leaving the page would discard what was typed
 *
 * While /auth/me is still answering, or when the server has no accounts
 * ('unavailable': anonymous intake as before), nothing is shown rather than
 * an action that could be wrong.
 */

const RETURN_QUERY = `?next=${encodeURIComponent(SUBMIT_ROUTE)}`

interface SubmitAuthActionsProps {
  auth: AuthState
  /** True once the visitor has typed into the listing. */
  hasUnsavedInput: boolean
  /** Opens the inline sign-in gate in the given mode, keeping the form mounted. */
  onOpenGate: (mode: AuthMode) => void
}

export default function SubmitAuthActions({ auth, hasUnsavedInput, onOpenGate }: SubmitAuthActionsProps) {
  if (auth.status === 'authenticated') {
    return (
      <p className="text-[13.5px] leading-[1.6] text-muted-dim">
        You’re signed in
        <span aria-hidden="true"> · </span>
        <Link to="/account/submissions" className="font-semibold text-accent hover:text-ink">
          My submissions
        </Link>
      </p>
    )
  }
  if (auth.status !== 'anonymous') return null

  return (
    <nav aria-label="Account" className="flex flex-wrap items-center gap-3">
      {hasUnsavedInput ? (
        <>
          <Button variant="subtle" onClick={() => onOpenGate('login')}>
            Log in
          </Button>
          <Button variant="outline" onClick={() => onOpenGate('register')}>
            Create account
          </Button>
        </>
      ) : (
        <>
          <Button variant="subtle" to={`/login${RETURN_QUERY}`}>
            Log in
          </Button>
          <Button variant="outline" to={`/register${RETURN_QUERY}`}>
            Create account
          </Button>
        </>
      )}
    </nav>
  )
}
