import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import RequireAuth, { AccountMessage } from '@/components/auth/RequireAuth'
import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/utils/adminFormat'

/*
 * Wraps the admin area. Like RequireAuth, a UX convenience and NOT the
 * security boundary: every /api/admin route answers 401/403 on its own,
 * whatever this renders. It only spares a non-admin a screen of errors.
 */

export default function RequireAdmin({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AdminOnly>{children}</AdminOnly>
    </RequireAuth>
  )
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  if (state.status !== 'authenticated') return null
  if (!isAdminRole(state.user.role)) {
    return (
      <AccountMessage title="Admins only">
        Your account doesn’t have access to the admin area.{' '}
        <Link to="/account/submissions" className="font-semibold text-accent hover:text-ink">
          Go to My submissions
        </Link>
      </AccountMessage>
    )
  }
  return <>{children}</>
}
