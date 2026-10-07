import { Link, NavLink, Outlet } from 'react-router-dom'
import mark from '@/assets/mark.png'
import { RoleBadge } from '@/components/admin/AdminBadges'
import { LABEL } from '@/components/admin/adminTheme'
import RequireAdmin from '@/components/admin/RequireAdmin'
import ScrollToTop from '@/components/layout/ScrollToTop'
import { useAuth } from '@/hooks/useAuth'

/*
 * The admin console's own frame for every /admin/* route — deliberately NOT
 * the public PageShell: no news ticker, no public nav, no ambient glow, no
 * footer. The public site is the product; this is an internal operations
 * console, and it should feel like one.
 *
 *   ┌ top bar: AI TOOL KART / ADMIN ·················· role · email · exit ┐
 *   ├ sidebar (lg+) ┬ page ─────────────────────────────────────────────── ┤
 *   │ OVERVIEW      │                                                      │
 *   │ SUBMISSIONS   │                                                      │
 *   │ …             │                                                      │
 *
 * Below `lg` the sidebar becomes a scrollable section strip under the top
 * bar. RequireAdmin guards the whole frame (UX only — the API authorizes
 * every request itself), so a non-admin never sees the console chrome.
 */

const SECTIONS = [
  { label: 'Overview', to: '/admin', end: true, key: '01' },
  { label: 'Submissions', to: '/admin/submissions', end: false, key: '02' },
  { label: 'Tools', to: '/admin/tools', end: false, key: '03' },
  { label: 'Users', to: '/admin/users', end: false, key: '04' },
  { label: 'Audit log', to: '/admin/audit', end: false, key: '05' },
] as const

function SidebarLink({ label, to, end, index }: { label: string; to: string; end: boolean; index: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-[6px] px-3 py-2 font-mono text-[12px] tracking-[0.08em] uppercase transition-colors duration-100 ${
          isActive ? 'bg-white/[0.05] text-ink' : 'text-[#8e88a8] hover:bg-white/[0.03] hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span aria-hidden="true" className={`absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full ${isActive ? 'bg-[#b49bff]' : 'bg-transparent'}`} />
          <span aria-hidden="true" className={isActive ? 'text-[#b49bff]' : 'text-[#5e5a72]'}>
            {index}
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

function StripLink({ label, to, end }: { label: string; to: string; end: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex-none px-3 py-2.5 font-mono text-[11.5px] tracking-[0.08em] whitespace-nowrap uppercase ${
          isActive ? 'text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-[#b49bff]' : 'text-[#8e88a8] hover:text-ink'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

function TopBar() {
  const { state, logout } = useAuth()
  const user = state.status === 'authenticated' ? state.user : undefined
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#060608]/95 px-3 backdrop-blur-sm sm:px-4">
      <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
        <img src={mark} alt="" className="h-[18px] w-[17px] flex-none opacity-90 brightness-0 invert" />
        <span className="truncate font-mono text-[12px] tracking-[0.1em] text-ink uppercase">
          AI Tool Kart <span className="text-[#5e5a72]">/</span> <span className="text-[#cbbaff]">Admin</span>
        </span>
      </Link>
      {user && (
        <div className="flex flex-none items-center gap-2 sm:gap-3">
          <RoleBadge role={user.role} />
          <span className="hidden max-w-[220px] truncate font-mono text-[11.5px] text-[#8e88a8] md:inline">{user.email}</span>
          <span aria-hidden="true" className="hidden h-4 w-px bg-white/[0.1] sm:block" />
          <Link to="/" className="hidden font-mono text-[11.5px] text-[#8e88a8] hover:text-ink sm:inline">
            View site ↗
          </Link>
          <button type="button" onClick={() => void logout()} className="cursor-pointer font-mono text-[11.5px] text-[#8e88a8] hover:text-ink">
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}

export default function AdminShell() {
  return (
    <RequireAdmin>
      <div className="min-h-screen bg-[#060608] text-[#cfcbe0]">
        <ScrollToTop />
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[6px] focus:bg-[#ece9f6] focus:px-3 focus:py-2 focus:text-[13px] focus:text-[#0b0b0f]"
        >
          Skip to content
        </a>
        <TopBar />
        <nav aria-label="Admin sections" className="sticky top-12 z-30 flex overflow-x-auto border-b border-white/[0.08] bg-[#060608]/95 px-1 backdrop-blur-sm lg:hidden">
          {SECTIONS.map((section) => (
            <StripLink key={section.to} label={section.label} to={section.to} end={section.end} />
          ))}
        </nav>
        <div className="flex">
          <aside className="sticky top-12 hidden h-[calc(100vh-3rem)] w-[220px] flex-none flex-col border-r border-white/[0.08] px-3 py-5 lg:flex">
            <p className={`${LABEL} px-3`}>Console</p>
            <nav aria-label="Admin sections" className="mt-2 flex flex-col gap-0.5">
              {SECTIONS.map((section) => (
                <SidebarLink key={section.to} label={section.label} to={section.to} end={section.end} index={section.key} />
              ))}
            </nav>
            <div className="mt-auto border-t border-white/[0.06] px-3 pt-4">
              <p className="font-mono text-[10.5px] leading-[1.6] text-[#5e5a72]">
                Every action is authorized by the server and recorded in the audit log.
              </p>
            </div>
          </aside>
          <main id="admin-main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-[1240px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </RequireAdmin>
  )
}
