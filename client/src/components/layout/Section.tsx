import type { ReactNode } from 'react'

/*
 * Standard content section: 1240px container, 32px gutters, 104px top rhythm.
 * Matches `max-width:1240px;margin:0 auto;padding:104px 32px 0` in the handoff.
 */

interface SectionProps {
  children: ReactNode
  /** Sub-page headers use 64px instead of the Home rhythm's 104px. */
  spacing?: 'home' | 'sub'
  center?: boolean
  className?: string
}

export default function Section({
  children,
  spacing = 'home',
  center = false,
  className = '',
}: SectionProps) {
  return (
    <section
      className={`mx-auto max-w-site px-8 ${spacing === 'home' ? 'pt-[104px]' : 'pt-16'} ${
        center ? 'text-center' : ''
      } ${className}`}
    >
      {children}
    </section>
  )
}
