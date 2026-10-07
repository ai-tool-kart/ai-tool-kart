import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AdminButton from '@/components/admin/AdminButton'
import { LABEL, SURFACE } from '@/components/admin/adminTheme'
import type { ResourceState } from '@/hooks/useAdminResource'

/*
 * The admin console's page frame and shared states: page header, panels,
 * facts, notices, empty states, and the loading / not-found / forbidden /
 * error views every screen renders while its data arrives.
 */

export interface Crumb {
  label: string
  to?: string
}

/** Breadcrumb trail + title + optional subtitle and actions. */
export function AdminPageHeader({ crumbs = [], title, subtitle, meta, actions }: { crumbs?: Crumb[]; title: string; subtitle?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-white/[0.06] pb-5">
      <div className="min-w-0">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] text-[#6f6a85] uppercase">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && <span aria-hidden="true">/</span>}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-[#a9a4bd]">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] break-words text-ink sm:text-[24px]">{title}</h1>
        {subtitle && <div className="mt-1.5 max-w-[72ch] text-[13.5px] leading-[1.55] text-[#8e88a8]">{subtitle}</div>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error' | 'warn'; children: ReactNode }) {
  const tones = {
    info: 'border-white/[0.1] bg-white/[0.02] text-[#b4b0c4] [--bar:#8b87a0]',
    success: 'border-[#4ade80]/25 bg-[#4ade80]/[0.05] text-[#a7e9c0] [--bar:#4ade80]',
    warn: 'border-[#fbbf24]/25 bg-[#fbbf24]/[0.05] text-[#f3d68f] [--bar:#fbbf24]',
    error: 'border-[#f87171]/30 bg-[#f87171]/[0.06] text-[#f9b4b4] [--bar:#f87171]',
  } as const
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`relative rounded-[6px] border py-2.5 pr-3.5 pl-4 text-[13px] leading-[1.55] before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[2px] before:rounded-full before:bg-[var(--bar)] ${tones[tone]}`}
    >
      {children}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[8px] border border-dashed border-white/[0.1] px-6 py-12 text-center">
      <span aria-hidden="true" className="font-mono text-[12px] text-[#5e5a72]">
        [ ∅ ]
      </span>
      {title && <p className="text-[14px] font-medium text-ink">{title}</p>}
      <div className="max-w-[52ch] text-[13px] leading-[1.6] text-[#8e88a8]">{children}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

function Skeleton() {
  return (
    <div role="status" aria-live="polite" className={`${SURFACE} flex flex-col gap-3 p-5`}>
      <span className="font-mono text-[12px] text-[#7f7a95]">Loading…</span>
      {[72, 54, 64].map((width) => (
        <span key={width} aria-hidden="true" className="h-2.5 animate-pulse rounded-[3px] bg-white/[0.05]" style={{ width: `${width}%` }} />
      ))}
    </div>
  )
}

/** Renders loading / not-found / forbidden / error, or `children(data)` when ready. */
export function ResourceView<T>({
  state,
  onRetry,
  what,
  children,
}: {
  state: ResourceState<T>
  onRetry: () => void
  /** "submission", "tool"… for the not-found line. */
  what: string
  children: (data: T) => ReactNode
}) {
  switch (state.status) {
    case 'loading':
      return <Skeleton />
    case 'not-found':
      return <EmptyState title="Not found">No {what} found with that id.</EmptyState>
    case 'forbidden':
      return <Notice tone="error">{state.message}</Notice>
    case 'error':
      return (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="error">{state.message}</Notice>
          <AdminButton onClick={onRetry}>Try again</AdminButton>
        </div>
      )
    case 'ready':
      return <>{children(state.data)}</>
  }
}

/** A titled panel. `flush` drops the body padding for tables and lists. */
export function Panel({ title, children, actions, flush = false }: { title: string; children: ReactNode; actions?: ReactNode; flush?: boolean }) {
  return (
    <section className={`${SURFACE} min-w-0`}>
      <div className="flex min-h-[42px] flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2">
        <h2 className={LABEL}>{title}</h2>
        {actions}
      </div>
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

/** Label/value pairs, two columns from `sm` up. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3.5 text-[13.5px] sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className={LABEL}>{label}</dt>
          <dd className="mt-1 break-words text-ink">{value ?? <span className="text-[#5e5a72]">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
