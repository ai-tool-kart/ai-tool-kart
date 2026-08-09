/*
 * Native select styled to the design.
 *  - pill:  Browse toolbar sort control
 *  - field: Compare column picker and Submit form fields
 */

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  variant?: 'pill' | 'field' | 'search'
  ariaLabel?: string
  className?: string
}

const VARIANTS = {
  pill: 'rounded-pill border border-white/[0.09] bg-white/[0.035] px-4 py-[13px] text-[14px] font-medium text-ink',
  field:
    'w-full rounded-md border border-hairline-strong bg-white/[0.035] px-3 py-[11px] text-[15px] font-semibold text-ink',
  /* Category picker inside the hero search shell. */
  search:
    'relative flex-none rounded-[42px] border border-white/[0.08] bg-white/[0.05] px-2 py-[10px] text-[13.5px] font-medium text-[#B9B3CE]',
} as const

export default function Select({
  value,
  onChange,
  options,
  variant = 'pill',
  ariaLabel,
  className = '',
}: SelectProps) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={`cursor-pointer outline-none ${VARIANTS[variant]} ${className}`}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}
