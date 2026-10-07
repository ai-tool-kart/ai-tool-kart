import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LABEL, SURFACE } from '@/components/admin/adminTheme'
import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/utils/adminFormat'

/*
 * Wraps the admin console. A UX convenience and NOT the security boundary:
 * every /api/admin route authorizes on the server (401/403) whatever this
 * renders, and the role shown here is only the one /auth/me returned. It
 * decides what to render while the session is read, sends a signed-out
 * visitor to /login with a return path (the same rule as RequireAuth), and
 * spares a signed-in non-admin a console full of errors.
 */

function GateScreen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060608] px-4">
      <div role="status" className={`${SURFACE} w-full max-w-[420px] p-6`}>
        <p className={LABEL}>AI Tool Kart / Admin</p>
        <h1 className="mt-2 text-[18px] font-semibold text-ink">{title}</h1>
        {children && <div className="mt-2 text-[13.5px] leading-[1.6] text-[#8e88a8]">{children}</div>}
      </div>
    </div>
  )
}

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <GateScreen title="Checking your session…" />
  if (state.status === 'unavailable') return <GateScreen title="Accounts are unavailable">Please try again later.</GateScreen>
  if (state.status === 'anonymous') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (!isAdminRole(state.user.role)) {
    return (
      <GateScreen title="Admins only">
        Your account doesn’t have access to the admin area.{' '}
        <Link to="/account/submissions" className="font-medium text-[#cbbaff] hover:text-ink">
          Go to My submissions
        </Link>
      </GateScreen>
    )
  }
  return <>{children}</>
}
