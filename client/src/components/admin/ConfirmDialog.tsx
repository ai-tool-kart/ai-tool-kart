import { useEffect, useId, useRef, type ReactNode } from 'react'
import AdminButton from '@/components/admin/AdminButton'
import { LABEL } from '@/components/admin/adminTheme'

/*
 * A modal confirmation for consequential admin actions (approve, reject,
 * role changes, ownership removal, saves).
 *
 * A div with role="dialog" + aria-modal rather than <dialog>.showModal():
 * the test environment (jsdom) does not implement showModal, and this needs
 * only three behaviours — focus moves in, Escape cancels, the backdrop
 * cancels — which are cheap to provide directly. While `busy`, nothing
 * cancels and the confirm button is disabled, so a double click cannot send
 * the action twice. It scrolls inside itself, so it always fits a phone.
 */

interface ConfirmDialogProps {
  title: string
  children?: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  /** Disables confirm (e.g. a required reason is still empty). */
  confirmDisabled?: boolean
  /** Red confirm and header for refusals and removals. */
  destructive?: boolean
  /** Small label above the title, e.g. "Privileged operation". */
  eyebrow?: string
}

export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  confirmDisabled = false,
  destructive = false,
  eyebrow,
}: ConfirmDialogProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('textarea, input, select, button')
    first?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/75" onClick={() => !busy && onCancel()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[520px] flex-col overflow-hidden rounded-[8px] border bg-[#0b0b0f] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ${
          destructive ? 'border-[#f87171]/30' : 'border-white/[0.12]'
        }`}
      >
        <div className={`border-b px-5 pt-4 pb-3 ${destructive ? 'border-[#f87171]/20' : 'border-white/[0.06]'}`}>
          {eyebrow && <p className={`${LABEL} mb-1 ${destructive ? 'text-[#f9a3a3]' : ''}`}>{eyebrow}</p>}
          <h2 id={titleId} className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h2>
        </div>
        {children && <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4 text-[13.5px] leading-[1.6] text-[#b4b0c4]">{children}</div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] bg-white/[0.01] px-5 py-3">
          <AdminButton variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton variant={destructive ? 'dangerSolid' : 'primary'} onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? 'Working…' : confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}
