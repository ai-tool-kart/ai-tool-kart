/*
 * Native select styled to the design.
 *  - pill:    Browse toolbar sort control
 *  - field:   Compare column picker and Submit form fields
 *  - search:  Category picker inside the hero search shell
 *  - savings: The role picker in "See What AI Can Save You"
 *
 * A real <select> in every variant. The handoff draws its own listbox for the
 * savings picker — a div that opens a styled panel — and this deliberately does
 * not reproduce that: the native control brings keyboard navigation, type-ahead,
 * screen-reader semantics and the platform's own touch picker for free, and a
 * hand-built listbox would have to earn all four back before it was even equal.
 * The visual difference is the open state, which is where a native picker is
 * most useful and least worth fighting.
 */

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  variant?: 'pill' | 'field' | 'search' | 'savings'
  ariaLabel?: string
  className?: string
  /**
   * Shown as a disabled first option while `value` is ''. Without one, a select
   * silently reports its first real option as chosen before anybody has chosen
   * anything.
   */
  placeholder?: string
  disabled?: boolean
  /** For associating an external <label>. */
  id?: string
}

const VARIANTS = {
  pill: 'rounded-pill border border-white/[0.09] bg-white/[0.035] px-4 py-[13px] text-[14px] font-medium text-ink',
  field:
    'w-full rounded-md border border-hairline-strong bg-white/[0.035] px-3 py-[11px] text-[15px] font-semibold text-ink',
  /* Category picker inside the hero search shell. */
  search:
    'relative flex-none rounded-[42px] border border-white/[0.08] bg-white/[0.05] px-2 py-[10px] text-[13.5px] font-medium text-[#B9B3CE]',
  /*
   * The savings role picker. 52px tall with room on the left for the person
   * glyph and on the right for the chevron, both drawn by the caller — hence
   * `appearance-none`, which also removes the platform arrow that would sit on
   * top of the design's own.
   */
  savings:
    'h-[52px] w-full appearance-none rounded-[15px] border border-white/[0.09] bg-white/[0.035] pr-11 pl-[43px] text-[14.5px] font-medium tracking-[-0.012em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,background,box-shadow] duration-300 hover:border-[rgba(120,226,172,0.44)] focus-visible:border-[rgba(120,226,172,0.52)] focus-visible:bg-[rgba(12,32,24,0.86)] focus-visible:shadow-[inset_0_1px_0_rgba(196,246,220,0.16),0_0_0_3px_rgba(74,208,148,0.12)]',
} as const

export default function Select({
  value,
  onChange,
  options,
  variant = 'pill',
  ariaLabel,
  className = '',
  placeholder,
  disabled = false,
  id,
}: SelectProps) {
  return (
    <select
      id={id}
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`cursor-pointer outline-none disabled:cursor-default disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}
