import { NavLink, Outlet } from 'react-router-dom'
import RequireAdmin from '@/components/admin/RequireAdmin'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABEL } from '@/utils/adminFormat'

/*
 * The /admin area's frame: the same page width and padding as the account
 * pages, an "Admin" eyebrow, and a section nav that reuses the nav pill's
 * link treatment (components/layout/NavPill.tsx) — so the area reads as part
 * of the product, not a separate dashboard template. The public header is
 * left exactly as it is; the way in is the account page's "Admin" button.
 */

const ADMIN_SECTIONS = [
  { label: 'Overview', to: '/admin', end: true },
  { label: 'Submissions', to: '/admin/submissions', end: false },
  { label: 'Catalogue', to: '/admin/tools', end: false },
  { label: 'Users', to: '/admin/users', end: false },
  { label: 'Audit log', to: '/admin/audit', end: false },
] as const

const LINK =
  'relative flex-none rounded-pill px-[14px] py-2 text-[14px] font-medium whitespace-nowrap text-subtle-soft transition-[background-color,color] duration-[250ms] hover:bg-white/[0.06] hover:text-ink'

function SignedInAs() {
  const { state } = useAuth()
  if (state.status !== 'authenticated') return null
  return (
    <p className="text-[13px] text-muted-dim">
      {state.user.email} · {ROLE_LABEL[state.user.role]}
    </p>
  )
}

export default function AdminLayout() {
  return (
    <section className="relative mx-auto max-w-site px-8 pt-16 pb-[88px]">
      <RequireAdmin>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">Admin</p>
          <SignedInAs />
        </div>
        <nav
          aria-label="Admin sections"
          className="mt-4 -mx-1 flex gap-[2px] overflow-x-auto rounded-nav border border-hairline bg-white/[0.02] p-1"
        >
          {ADMIN_SECTIONS.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.end} className={LINK}>
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden="true" className="absolute inset-0 rounded-pill bg-white/[0.07] shadow-nav-item" />}
                  <span className={`relative ${isActive ? 'text-ink' : ''}`}>{section.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-8">
          <Outlet />
        </div>
      </RequireAdmin>
    </section>
  )
}
