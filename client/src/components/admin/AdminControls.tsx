import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import AdminButton from '@/components/admin/AdminButton'
import { CONTROL, LABEL } from '@/components/admin/adminTheme'

/*
 * Filters, pagination and form fields for the admin console.
 *
 * FilterBar lays the search box out on its own full-width line below `md`
 * and beside the filters above it, so the box can never be squeezed down to
 * nothing (it used to collapse to ~34px at phone widths).
 */

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">{children}</div>
}

/** A search box that applies on submit (Enter), not on every keystroke. */
export function SearchBox({ value, onSearch, placeholder, label }: { value: string; onSearch: (value: string) => void; placeholder: string; label: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(draft.trim())
  }
  return (
    <form role="search" onSubmit={submit} className="flex w-full min-w-0 gap-2 md:w-auto md:min-w-[280px] md:flex-1">
      <div className="relative min-w-0 flex-1">
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[12px] text-[#5e5a72]">
          ›
        </span>
        <input
          type="search"
          aria-label={label}
          value={draft}
          maxLength={200}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          className={`${CONTROL} pl-7`}
        />
      </div>
      <AdminButton type="submit">Search</AdminButton>
    </form>
  )
}

export interface Option {
  value: string
  label: string
}

export function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: Option[]; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={`${CONTROL} w-full cursor-pointer md:w-auto md:min-w-[160px]`}>
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
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="font-mono text-[12px] text-[#7f7a95]">
        {first}–{last} of {total}
      </span>
      <span className="flex gap-2">
        <AdminButton disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Previous
        </AdminButton>
        <AdminButton disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next →
        </AdminButton>
      </span>
    </nav>
  )
}

interface FieldProps {
  label: string
  /** Input name; also tags the wrapper with data-field. */
  name?: string
  hint?: string
  error?: string
  required?: boolean
  /** Shows a live "{length}/{max}" counter. */
  maxLength?: number
  value?: string
  children?: ReactNode
}

function FieldFrame({ label, name, hint, error, required, maxLength, value, children }: FieldProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5" data-field={name}>
      <span className="flex items-baseline justify-between gap-3">
        <span className={LABEL}>
          {label}
          {required && <span className="text-[#b49bff]"> *</span>}
        </span>
        {maxLength !== undefined && (
          <span className="font-mono text-[10.5px] text-[#5e5a72] tabular-nums">
            {(value ?? '').length}/{maxLength}
          </span>
        )}
      </span>
      {hint && <span className="text-[12px] leading-[1.5] text-[#7f7a95]">{hint}</span>}
      {children}
      {error && (
        <span id={name ? `${name}-error` : undefined} role="alert" className="text-[12px] leading-[1.5] text-[#f9a3a3]">
          {error}
        </span>
      )}
    </label>
  )
}

/** A labelled text input or textarea in the console's style. */
export function AdminField({
  type = 'text',
  textarea = false,
  rows = 4,
  onChange,
  placeholder,
  mono = false,
  ...frame
}: FieldProps & { type?: string; textarea?: boolean; rows?: number; onChange: (value: string) => void; placeholder?: string; mono?: boolean }) {
  const shared = {
    name: frame.name,
    value: frame.value,
    required: frame.required,
    maxLength: frame.maxLength,
    placeholder,
    'aria-invalid': frame.error ? true : undefined,
    'aria-describedby': frame.error && frame.name ? `${frame.name}-error` : undefined,
    className: `${CONTROL} ${mono ? 'font-mono text-[13px]' : ''}`,
  }
  return (
    <FieldFrame {...frame}>
      {textarea ? (
        <textarea {...shared} rows={rows} onChange={(event) => onChange(event.target.value)} className={`${shared.className} resize-y`} />
      ) : (
        <input {...shared} type={type} onChange={(event) => onChange(event.target.value)} />
      )}
    </FieldFrame>
  )
}

/** A labelled native select. */
export function AdminSelectField({ label, value, options, onChange, error }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; error?: string }) {
  return (
    <FieldFrame label={label} error={error}>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={`${CONTROL} cursor-pointer`}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldFrame>
  )
}

/** A wrap-around group of toggle chips for a closed vocabulary (roles, stages, use cases). */
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
    <fieldset data-field={name} className="flex min-w-0 flex-col gap-1.5">
      <legend className={`${LABEL} mb-1.5`}>
        {legend} <span className="text-[#5e5a72] normal-case">· {value.length} selected</span>
      </legend>
      <div className="flex max-h-[200px] flex-wrap gap-1.5 overflow-y-auto rounded-[6px] border border-white/[0.06] bg-[#08080b] p-2">
        {options.map((option) => {
          const checked = value.includes(option)
          return (
            <label
              key={option}
              className={`cursor-pointer rounded-[4px] border px-2 py-[5px] text-[12.5px] transition-[border-color,color,background-color] duration-150 focus-within:outline-2 focus-within:outline-[#b49bff] ${
                checked ? 'border-[#b49bff]/45 bg-[#b49bff]/[0.1] text-[#d9ccff]' : 'border-white/[0.08] text-[#a9a4bd] hover:border-white/[0.2]'
              }`}
            >
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(option)} />
              {option}
            </label>
          )
        })}
      </div>
      {error && (
        <span role="alert" className="text-[12px] leading-[1.5] text-[#f9a3a3]">
          {error}
        </span>
      )}
    </fieldset>
  )
}
