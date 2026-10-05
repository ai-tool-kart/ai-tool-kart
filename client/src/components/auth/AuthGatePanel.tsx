import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AuthForm, { type AuthMode } from '@/components/auth/AuthForm'
import SpotCard from '@/components/ui/SpotCard'
import type { PublicUser } from '@/types/auth'

/*
 * The Submit page's inline sign-in gate.
 *
 * A dialog over the page — rendered OUTSIDE the Submit <form> (forms can't
 * nest) while that form stays mounted underneath, so nothing typed is lost
 * and nothing is copied into browser storage. On success the caller
 * continues the submission it was holding.
 *
 * Escape or "Not now" closes it and returns to the intact form.
 *
 * Portalled to <body>: PageShell wraps every page in a `relative z-[1]`
 * stacking context, so rendered in place the overlay could never rise above
 * the sticky header.
 */

interface AuthGatePanelProps {
  onAuthenticated: (user: PublicUser) => void
  onClose: () => void
  /** Shown above the form, e.g. why the gate appeared. */
  message?: string
}

export default function AuthGatePanel({ onAuthenticated, onClose, message }: AuthGatePanelProps) {
  const [mode, setMode] = useState<AuthMode>('register')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('input')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[rgba(8,6,20,0.72)] px-4 py-10 backdrop-blur-[6px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
        className="w-full max-w-[460px]"
      >
        <SpotCard topHairline className="rounded-panel p-7 sm:p-8">
          <div className="relative flex flex-col gap-5">
            <div>
              <h2 id="auth-gate-title" className="text-[22px] font-bold tracking-[-0.03em] text-ink">
                {mode === 'register' ? 'Create an account to submit' : 'Sign in to submit'}
              </h2>
              <p className="mt-2 text-[14px] leading-[1.6] text-muted-dim">
                {message ?? 'Your listing is saved on this page. Sign in and it will be submitted straight away.'}
              </p>
            </div>
            <AuthForm key={mode} mode={mode} onModeChange={setMode} onSuccess={onAuthenticated} />
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer self-center text-[13.5px] font-medium text-muted-dim hover:text-ink"
            >
              Not now — back to my listing
            </button>
          </div>
        </SpotCard>
      </div>
    </div>,
    document.body,
  )
}
