/*
 * Gradient monogram square used as the tool avatar.
 * Sizes match the three card variants in the design: 48/44/42px, plus a
 * 22px `xs` for inline tool chips (the assistant plan's "Tools used" row).
 */

interface MonogramProps {
  mono: string
  size?: 'lg' | 'md' | 'sm' | 'xs'
}

const SIZES = {
  lg: 'h-12 w-12 rounded-[15px] text-[17px]',
  md: 'h-11 w-11 rounded-field text-[15px]',
  sm: 'h-[42px] w-[42px] rounded-md text-[15px]',
  xs: 'h-[22px] w-[22px] rounded-[7px] text-[9.5px]',
} as const

const SHADOWS = {
  lg: 'shadow-[0_8px_18px_-8px_rgba(116,80,244,0.9)]',
  md: 'shadow-[0_8px_16px_-10px_rgba(116,80,244,0.9)]',
  sm: 'shadow-[0_6px_14px_-8px_rgba(116,80,244,0.9)]',
  xs: 'shadow-[0_4px_10px_-6px_rgba(116,80,244,0.9)]',
} as const

export default function Monogram({ mono, size = 'lg' }: MonogramProps) {
  return (
    <div
      className={`flex flex-none items-center justify-center border border-white/[0.14] bg-[image:var(--gradient-monogram)] font-bold tracking-[-0.02em] text-white ${SIZES[size]} ${SHADOWS[size]}`}
    >
      {mono}
    </div>
  )
}
