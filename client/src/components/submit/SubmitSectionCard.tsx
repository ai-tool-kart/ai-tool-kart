import type { ReactNode } from 'react'
import SpotCard from '@/components/ui/SpotCard'

/*
 * The numbered panel every Submit section renders inside — SpotCard's glass
 * surface with the step badge, title and optional description the design's
 * four-step flow needs, so each section file only supplies its own fields.
 */

interface SubmitSectionCardProps {
  step: number
  title: string
  description?: string
  /** Right-aligned uppercase tag, e.g. "Optional". */
  tag?: string
  children: ReactNode
  className?: string
}

export default function SubmitSectionCard({
  step,
  title,
  description,
  tag,
  children,
  className = '',
}: SubmitSectionCardProps) {
  return (
    <SpotCard reveal="stagger" className={`rounded-panel p-7 sm:p-8 ${className}`}>
      <div className="relative flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-white/[0.16] bg-[image:var(--gradient-cta)] text-[13px] font-bold text-white shadow-button">
              {String(step).padStart(2, '0')}
            </span>
            <div>
              <h2 className="text-[21px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
              {description && (
                <p className="mt-[6px] max-w-[54ch] text-[13.5px] leading-[1.6] text-pretty text-muted-dim">
                  {description}
                </p>
              )}
            </div>
          </div>
          {tag && (
            <span className="flex-none rounded-tag bg-accent-wash-strong px-[10px] py-[5px] text-[11px] font-bold tracking-[0.05em] whitespace-nowrap uppercase text-accent">
              {tag}
            </span>
          )}
        </div>
        {children}
      </div>
    </SpotCard>
  )
}
