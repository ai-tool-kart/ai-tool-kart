import type { ReactNode } from 'react'

/*
 * Labelled form control used by the Submit page.
 *
 * The design's focus treatment (`style-focus`) becomes a real focus: variant:
 *   border-color #A98BFF, 4px rgba(202,168,255,0.216) ring, lighter fill.
 */

const CONTROL_CLASSES =
  'w-full rounded-md border border-hairline-strong bg-white/[0.04] px-[15px] py-[13px] text-[15px] text-ink outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-accent-strong focus:bg-white/[0.035] focus:shadow-[0_0_0_4px_rgba(202,168,255,0.216)]'

interface FormFieldProps {
  label: string
  children?: ReactNode
  /** Native input props, used when no custom control is passed as children. Also the
   *  key an error is attached under (see `error`) and what `[data-field]` is tagged with. */
  name?: string
  type?: string
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  textarea?: boolean
  rows?: number
  /** Shows a live "{length}/{max}" counter beside the label and caps native input. */
  maxLength?: number
  /** Short helper line under the label, above the control. */
  hint?: string
  /**
   * A validation message for this field, e.g. from a 400's `fields` map.
   * Rendered under the control and linked to it via `aria-describedby`.
   */
  error?: string
}

export default function FormField({
  label,
  children,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  textarea = false,
  rows = 4,
  maxLength,
  hint,
  error,
}: FormFieldProps) {
  const errorId = name && error ? `${name}-error` : undefined
  return (
    <label className="flex flex-col gap-[7px]" data-field={name}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] tracking-[0.05em] uppercase text-subtle">
          {label}
          {required && <span className="text-accent"> *</span>}
        </span>
        {maxLength !== undefined && (
          <span className="text-[11px] font-medium tabular-nums text-subtle-dim">
            {(value ?? '').length}/{maxLength}
          </span>
        )}
      </span>
      {hint && <span className="-mt-[3px] text-[12.5px] leading-[1.5] text-muted-dim">{hint}</span>}
      {children ??
        (textarea ? (
          <textarea
            name={name}
            value={value}
            rows={rows}
            required={required}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={`${CONTROL_CLASSES} resize-y`}
          />
        ) : (
          <input
            name={name}
            type={type}
            value={value}
            required={required}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={CONTROL_CLASSES}
          />
        ))}
      {error && (
        <span id={errorId} role="alert" className="text-[12.5px] leading-[1.5] text-pink">
          {error}
        </span>
      )}
    </label>
  )
}
