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
  /** Native input props, used when no custom control is passed as children. */
  name?: string
  type?: string
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  textarea?: boolean
  rows?: number
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
}: FormFieldProps) {
  return (
    <label className="flex flex-col gap-[7px]">
      <span className="text-[13px] tracking-[0.05em] uppercase text-subtle">{label}</span>
      {children ??
        (textarea ? (
          <textarea
            name={name}
            value={value}
            rows={rows}
            required={required}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className={`${CONTROL_CLASSES} resize-y`}
          />
        ) : (
          <input
            name={name}
            type={type}
            value={value}
            required={required}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className={CONTROL_CLASSES}
          />
        ))}
    </label>
  )
}
