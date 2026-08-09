import { formatRating } from '@/utils/format'

/** Minimum-rating slider on the Browse sidebar. */

interface RangeSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel?: string
}

export default function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 5,
  step = 0.5,
  ariaLabel = 'Minimum rating',
}: RangeSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-auto accent-accent-strong"
      />
      <span className="text-[14px] font-semibold whitespace-nowrap text-ink">
        {formatRating(value)}
      </span>
    </div>
  )
}
