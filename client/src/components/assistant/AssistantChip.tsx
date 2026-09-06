import type { ReactNode } from 'react'

/*
 * The two chip tones the assistant stage uses.
 *
 * `neutral` is the suggestion/follow-up chip in the chat panel — a low-contrast
 * pill that warms to violet on hover. `accent` is the plan panel's chip, which
 * starts violet because it names something the plan already decided.
 *
 * Both are buttons, never divs: the design's `data-cardish` chips are clickable
 * text, and a keyboard user has to be able to reach every refinement the mouse
 * can. Everything else — padding, radius, the 250ms hover transition and the
 * 1px lift — is the design's.
 *
 * ui/Chip.tsx is not reused here: its two variants are the Browse sidebar's
 * filter pill and a static card tag, which carry different geometry (999px
 * radius, 13px text) and no lift. Forcing a third variant into it would make one
 * component answer to two unrelated designs.
 */

const BASE =
  'cursor-pointer rounded-chip border px-[13px] py-[7px] text-[12.5px] font-medium ' +
  'transition-[color,border-color,background-color,transform] duration-250 ' +
  'ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const TONES = {
  neutral:
    'border-white/[0.1] bg-white/[0.035] text-[#C3BCD8] ' +
    'hover:border-[rgba(178,150,255,0.5)] hover:bg-[rgba(124,88,244,0.16)] hover:text-[#EFE9FF]',
  accent:
    'rounded-[9px] px-[11px] py-[6px] tracking-[-0.006em] ' +
    'border-[rgba(178,150,255,0.24)] bg-[rgba(124,88,244,0.14)] text-[#E2DAF8] ' +
    'hover:border-[rgba(196,168,255,0.55)] hover:bg-[rgba(124,88,244,0.26)] hover:text-white',
} as const

interface AssistantChipProps {
  children: ReactNode
  onClick: () => void
  tone?: keyof typeof TONES
  disabled?: boolean
  /** Set when the chip's label alone does not say what activating it does. */
  title?: string
  /** `flex-none` + no wrapping, for the horizontally scrolling suggestion rail. */
  fixed?: boolean
}

export default function AssistantChip({
  children,
  onClick,
  tone = 'neutral',
  disabled = false,
  title,
  fixed = false,
}: AssistantChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${BASE} ${TONES[tone]} ${fixed ? 'flex-none whitespace-nowrap' : ''} disabled:cursor-default disabled:opacity-50 disabled:hover:translate-y-0`}
    >
      {children}
    </button>
  )
}
