import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/*
 * Wraps a signed-in-only page. A UX convenience, NOT a security boundary:
 * the API behind every such page answers 401/404 on its own. This only
 * decides what to render while /auth/me answers.
 */

export function AccountMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" className="mx-auto max-w-[520px] py-16 text-center">
      <h1 className="text-[24px] font-bold tracking-[-0.03em] text-ink">{title}</h1>
      {children && <div className="mt-3 text-[14.5px] leading-[1.6] text-muted-dim">{children}</div>}
    </div>
  )
}

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <AccountMessage title="Loading your account…" />
  if (state.status === 'unavailable') {
    return <AccountMessage title="Accounts are unavailable">Please try again later.</AccountMessage>
  }
  if (state.status === 'anonymous') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}
