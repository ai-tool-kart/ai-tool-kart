import { useEffect, useRef, useState } from 'react'
import FormField from '@/components/ui/FormField'
import SubmitSectionCard from '@/components/submit/SubmitSectionCard'

/*
 * Step 1 — the URL gate. brofindai.com/submit opens the same way: a single
 * URL field the rest of the flow builds on, with a duplicate/logo check.
 *
 * There is no lookup endpoint here (the catalogue API has no such route yet —
 * see server/src/http/routes), so "Check URL" simulates the round trip rather
 * than calling nothing. It never blocks the rest of the form; it's a nicety,
 * not a gate.
 */

interface SubmitUrlSectionProps {
  value: string
  onChange: (value: string) => void
}

export default function SubmitUrlSection({ value, onChange }: SubmitUrlSectionProps) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready'>('idle')
  const checkTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => window.clearTimeout(checkTimerRef.current)
  }, [])

  const check = () => {
    if (!value.trim()) return
    setStatus('checking')
    checkTimerRef.current = window.setTimeout(() => setStatus('ready'), 700)
  }

  return (
    <SubmitSectionCard
      step={1}
      title="Start with your URL"
      description="Paste your site's address. We check it isn't already listed, and use its icon as your logo."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-auto">
          <FormField
            label="Website URL"
            required
            type="url"
            name="siteUrl"
            value={value}
            placeholder="https://yourtool.com"
            onChange={(next) => {
              onChange(next)
              setStatus('idle')
            }}
          />
        </div>
        <button
          type="button"
          onClick={check}
          disabled={!value.trim() || status === 'checking'}
          className="inline-flex h-[47px] flex-none cursor-pointer items-center justify-center gap-2 rounded-md border border-white/[0.1] bg-white/[0.05] px-5 text-[14px] font-semibold whitespace-nowrap text-ink transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-accent-line hover:bg-accent-wash disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-white/[0.1] disabled:hover:bg-white/[0.05]"
        >
          {status === 'checking' && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="h-[15px] w-[15px] animate-spin">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          )}
          {status === 'checking' ? 'Checking…' : 'Check URL'}
        </button>
      </div>

      {status === 'ready' && (
        <p className="inline-flex items-center gap-[7px] text-[13px] font-medium text-[#9BE7C4]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4 flex-none">
            <path d="m4 12.5 5 5L20 6" />
          </svg>
          Looks good — nothing in the catalogue matches this URL yet.
        </p>
      )}
    </SubmitSectionCard>
  )
}
