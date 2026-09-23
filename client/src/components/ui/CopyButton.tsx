import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'

/*
 * Copy-to-clipboard, built from Button.
 *
 * A general primitive: it knows nothing about prompts. The automation detail
 * page is its first user (the sample prompt), and anything else that hands a
 * reader text to paste elsewhere should use this rather than grow its own.
 *
 * ── Two ways to copy ─────────────────────────────────────────────────────────
 *
 * `navigator.clipboard.writeText` needs a secure context and permission; on
 * plain http (a LAN preview, say) or in a browser that refuses, it throws. The
 * fallback is the old hidden-textarea + `execCommand('copy')`, deprecated but
 * still honoured everywhere that matters. If both fail the button says so
 * rather than claiming a copy that did not happen.
 *
 * ── Announced, not just shown ────────────────────────────────────────────────
 *
 * The label flips to "Copied" for about two seconds, and the same word goes
 * into a polite live region, so a screen-reader user hears the result of an
 * action whose only other feedback is visual.
 */

/** How long "Copied" stays before the label reverts. */
const RESET_MS = 2000

type CopyState = 'idle' | 'copied' | 'failed'

interface CopyButtonProps {
  /** What to copy. Empty or whitespace-only disables the button. */
  text: string
  /** Visible label at rest. */
  label?: string
  copiedLabel?: string
  failedLabel?: string
  className?: string
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fall through to the textarea path below.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export default function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  failedLabel = 'Copy failed',
  className = '',
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle')
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const copy = useCallback(() => {
    void copyText(text).then((ok) => {
      setState(ok ? 'copied' : 'failed')
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setState('idle'), RESET_MS)
    })
  }, [text])

  const empty = text.trim().length === 0
  const shown = state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : label

  return (
    <>
      <Button variant="ghost" onClick={copy} disabled={empty} className={className}>
        {shown}
      </Button>
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : ''}
      </span>
    </>
  )
}
