import { useState } from 'react'

/*
 * Free-text list builder — tags and alternative tools in Advanced Details.
 * Enter or comma commits the draft as a chip; Backspace on an empty draft
 * pops the last one. Capped at `max` so the card preview never has to truncate
 * a wall of tags.
 */

interface TagInputProps {
  label: string
  hint?: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  max: number
}

export default function TagInput({ label, hint, values, onChange, placeholder, max }: TagInputProps) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const next = draft.trim()
    setDraft('')
    if (!next || values.length >= max) return
    if (values.some((v) => v.toLowerCase() === next.toLowerCase())) return
    onChange([...values, next])
  }

  const remove = (target: string) => onChange(values.filter((v) => v !== target))

  return (
    <div className="flex flex-col gap-[7px]">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] tracking-[0.05em] uppercase text-subtle">{label}</span>
        <span className="text-[11px] font-medium tabular-nums text-subtle-dim">
          {values.length}/{max}
        </span>
      </span>
      {hint && <span className="-mt-[3px] text-[12.5px] leading-[1.5] text-muted-dim">{hint}</span>}

      <div className="flex flex-wrap items-center gap-[7px] rounded-md border border-hairline-strong bg-white/[0.04] px-[11px] py-[9px] transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-accent-strong focus-within:bg-white/[0.035] focus-within:shadow-[0_0_0_4px_rgba(202,168,255,0.216)]">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-[6px] rounded-tag bg-white/[0.07] py-[5px] pr-[6px] pl-[10px] text-[12.5px] text-muted-soft"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remove ${tag}`}
              className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-subtle-dim transition-colors duration-150 hover:bg-white/[0.12] hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="h-[9px] w-[9px]">
                <path d="M5 5l14 14M19 5 5 19" />
              </svg>
            </button>
          </span>
        ))}
        {values.length < max && (
          <input
            type="text"
            aria-label={label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
                onChange(values.slice(0, -1))
              }
            }}
            onBlur={commit}
            placeholder={values.length === 0 ? placeholder : ''}
            className="min-w-[120px] flex-auto border-0 bg-transparent px-1 py-[5px] text-[14px] text-ink outline-none"
          />
        )}
      </div>
    </div>
  )
}
