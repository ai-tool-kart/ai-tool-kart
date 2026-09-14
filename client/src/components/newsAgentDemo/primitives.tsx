/*
 * Shared presentation atoms for the News Agent dashboard.
 *
 * This is an internal debug/demo surface, not a marketing page, so it uses plain
 * neutral Tailwind utilities rather than the site's design tokens. Keeping it
 * visually separate from the product is intentional: nobody should mistake this
 * screen for the AI Tool Kart UI.
 *
 * Components only — helpers live in ./format.ts.
 */

import type { ReactNode } from 'react'

export function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      {(title || right) && (
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-zinc-200">{children}</dd>
    </div>
  )
}

export function Pill({
  tone,
  children,
}: {
  tone: 'good' | 'warn' | 'bad' | 'neutral'
  children: ReactNode
}) {
  const tones = {
    good: 'border-emerald-700/60 bg-emerald-950/50 text-emerald-300',
    warn: 'border-amber-700/60 bg-amber-950/50 text-amber-300',
    bad: 'border-red-800/60 bg-red-950/50 text-red-300',
    neutral: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
  } as const
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[11px] ${tones[tone]}`}>
      {children}
    </span>
  )
}

/** Trust tier is a load-bearing concept in this pipeline, so it is always shown. */
export function TierPill({ tier }: { tier?: number }) {
  if (!tier) return null
  const tone = tier === 1 ? 'good' : tier === 2 ? 'neutral' : 'warn'
  const label = tier === 1 ? 'Tier 1 · primary' : tier === 2 ? 'Tier 2 · reputable' : 'Tier 3 · signal'
  return <Pill tone={tone}>{label}</Pill>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>
}
