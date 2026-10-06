import { useEffect, useId, useRef, type ReactNode } from 'react'
import Button from '@/components/ui/Button'

/*
 * A modal confirmation for consequential admin actions (approve, reject,
 * role changes, ownership removal).
 *
 * A div with role="dialog" + aria-modal rather than <dialog>.showModal():
 * the test environment (jsdom) does not implement showModal, and this needs
 * only three behaviours — focus moves in, Escape cancels, the backdrop
 * cancels — which are cheap to provide directly. While `busy`, nothing
 * cancels and the confirm button is disabled, so a double click cannot send
 * the action twice.
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
  /** Red-toned confirm for refusals and removals. */
  destructive?: boolean
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={() => !busy && onCancel()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[520px] rounded-panel border border-hairline-strong bg-[#0d0b13] p-6 shadow-nav"
      >
        <h2 id={titleId} className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        {children && <div className="mt-3 flex flex-col gap-4 text-[14.5px] leading-[1.6] text-muted-soft">{children}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="subtle" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="gradient"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={destructive ? 'bg-none! bg-[#c43d63]! shadow-none!' : ''}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
