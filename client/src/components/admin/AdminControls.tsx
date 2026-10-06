import { useEffect, useState, type FormEvent } from 'react'
import Button from '@/components/ui/Button'

/*
 * Filter and pagination controls for the admin lists. Native elements in
 * the Browse toolbar's pill styling (components/ui/Select.tsx 'pill').
 */

const PILL =
  'rounded-pill border border-white/[0.09] bg-white/[0.035] px-4 py-[11px] text-[14px] font-medium text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-accent-strong focus:shadow-[0_0_0_4px_rgba(202,168,255,0.216)]'

/** A search box that applies on submit (Enter), not on every keystroke. */
export function SearchBox({ value, onSearch, placeholder, label }: { value: string; onSearch: (value: string) => void; placeholder: string; label: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(draft.trim())
  }
  return (
    <form role="search" onSubmit={submit} className="flex min-w-0 flex-1 gap-2">
      <input
        type="search"
        aria-label={label}
        value={draft}
        maxLength={200}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        className={`${PILL} min-w-0 flex-1 placeholder:text-placeholder`}
      />
      <Button type="submit" variant="subtle" className="py-[11px]!">
        Search
      </Button>
    </form>
  )
}

export interface Option {
  value: string
  label: string
}

export function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: Option[]; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={`${PILL} cursor-pointer`}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-muted-dim">
      <span>
        {first}–{last} of {total}
      </span>
      <span className="flex gap-2">
        <Button variant="subtle" className="py-[9px]!" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Previous
        </Button>
        <Button variant="subtle" className="py-[9px]!" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next →
        </Button>
      </span>
    </nav>
  )
}

/** A wrap-around group of checkboxes for a closed vocabulary (roles, stages, use cases). */
export function CheckboxGroup({
  legend,
  options,
  value,
  onChange,
  error,
  name,
}: {
  legend: string
  options: readonly string[]
  value: string[]
  onChange: (value: string[]) => void
  error?: string
  name: string
}) {
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])
  return (
    <fieldset data-field={name} className="flex flex-col gap-[7px]">
      <legend className="mb-[7px] text-[13px] tracking-[0.05em] text-subtle uppercase">{legend}</legend>
      <div className="flex max-h-[220px] flex-wrap gap-2 overflow-y-auto">
        {options.map((option) => {
          const checked = value.includes(option)
          return (
            <label
              key={option}
              className={`cursor-pointer rounded-pill border px-3 py-[7px] text-[13px] transition-[border-color,color,background-color] duration-200 ${
                checked ? 'border-accent-line bg-accent-wash-strong text-accent' : 'border-white/[0.09] text-muted-soft hover:border-accent-line'
              }`}
            >
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(option)} />
              {option}
            </label>
          )
        })}
      </div>
      {error && (
        <span role="alert" className="text-[12.5px] leading-[1.5] text-pink">
          {error}
        </span>
      )}
    </fieldset>
  )
}
