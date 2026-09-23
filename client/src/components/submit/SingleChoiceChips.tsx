import Chip from '@/components/ui/Chip'

/*
 * A labelled, single-select chip row — the category and pricing-model pickers
 * in the Essentials section. Radio semantics over Chip's `filter` variant,
 * which already carries the design's accent-wash active state.
 */

interface SingleChoiceChipsProps {
  label: string
  /** The field key an error is attached under, and what `[data-field]` is tagged with. */
  name?: string
  required?: boolean
  hint?: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  /** Shown in place of the row while `options` is empty (taxonomy still loading). */
  loadingHint?: string
  /** A validation message for this field, e.g. from a 400's `fields` map. */
  error?: string
}

export default function SingleChoiceChips({
  label,
  name,
  required,
  hint,
  options,
  value,
  onChange,
  loadingHint,
  error,
}: SingleChoiceChipsProps) {
  const errorId = name && error ? `${name}-error` : undefined
  return (
    <div className="flex flex-col gap-[9px]" data-field={name}>
      <span className="text-[13px] tracking-[0.05em] uppercase text-subtle">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {hint && <span className="-mt-1 text-[12.5px] leading-[1.5] text-muted-dim">{hint}</span>}
      {options.length === 0 ? (
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          {Array.from({ length: 5 }, (_unused, index) => (
            <span
              key={index}
              className="h-[31px] w-[86px] animate-pulse rounded-pill border border-white/[0.09] bg-white/[0.035]"
            />
          ))}
          {loadingHint && <span className="self-center text-[12.5px] text-subtle-dim">{loadingHint}</span>}
        </div>
      ) : (
        <div role="radiogroup" aria-label={label} aria-describedby={errorId} className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Chip key={option} variant="filter" active={value === option} onClick={() => onChange(option)}>
              {option}
            </Chip>
          ))}
        </div>
      )}
      {error && (
        <span id={errorId} role="alert" className="text-[12.5px] leading-[1.5] text-pink">
          {error}
        </span>
      )}
    </div>
  )
}
