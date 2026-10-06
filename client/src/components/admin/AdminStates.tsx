import type { ReactNode } from 'react'
import Button from '@/components/ui/Button'
import type { ResourceState } from '@/hooks/useAdminResource'

/*
 * The states every admin screen shares, in the account pages' type scale.
 */

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[clamp(28px,3.6vw,36px)] font-bold tracking-[-0.04em] break-words text-ink">{title}</h1>
        {subtitle && <div className="mt-2 text-[14.5px] leading-[1.6] text-muted-dim">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error'; children: ReactNode }) {
  const tones = {
    info: 'border-hairline-strong bg-white/[0.03] text-muted-soft',
    success: 'border-[rgba(120,226,172,0.35)] bg-[rgba(74,208,148,0.08)] text-[#bdf0d6]',
    error: 'border-[rgba(255,124,158,0.35)] bg-pink-bg text-pink',
  } as const
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-field border px-4 py-3 text-[14px] leading-[1.55] ${tones[tone]}`}>
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-hairline-strong px-6 py-10 text-center text-[14.5px] text-muted-dim">
      {children}
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
      return (
        <p role="status" className="text-[14.5px] text-muted-dim">
          Loading…
        </p>
      )
    case 'not-found':
      return <EmptyState>No {what} found with that id.</EmptyState>
    case 'forbidden':
      return <Notice tone="error">{state.message}</Notice>
    case 'error':
      return (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="error">{state.message}</Notice>
          <Button variant="subtle" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )
    case 'ready':
      return <>{children(state.data)}</>
  }
}

/** A titled panel inside a detail page. */
export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-panel border border-hairline bg-white/[0.02] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[13px] tracking-[0.05em] text-subtle uppercase">{title}</h2>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** A definition list of label/value pairs, two columns from `sm` up. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-subtle">{label}</dt>
          <dd className="break-words text-ink">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
