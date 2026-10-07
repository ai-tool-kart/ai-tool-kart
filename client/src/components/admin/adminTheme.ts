/*
 * The admin console's small visual vocabulary.
 *
 * The admin area is an internal operations console, not the product, so it
 * has its own restrained palette: near-black surfaces, hairline borders, a
 * monospace "label" voice, and a handful of status tones. Everything that
 * picks a colour reads it from here, so a status can never be green on one
 * page and amber on another.
 */

export type Tone = 'neutral' | 'info' | 'accent' | 'warn' | 'ok' | 'danger'

/** Badge/chip classes per tone: border, tint and text. */
export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'border-white/[0.12] bg-white/[0.03] text-[#b4b0c4]',
  info: 'border-[#7dd3fc]/30 bg-[#7dd3fc]/[0.07] text-[#a5dcf7]',
  accent: 'border-[#b49bff]/35 bg-[#b49bff]/[0.08] text-[#cbbaff]',
  warn: 'border-[#fbbf24]/30 bg-[#fbbf24]/[0.07] text-[#f6cf6b]',
  ok: 'border-[#4ade80]/30 bg-[#4ade80]/[0.07] text-[#86e3a8]',
  danger: 'border-[#f87171]/35 bg-[#f87171]/[0.08] text-[#f9a3a3]',
}

/** The small status dot inside a badge. */
export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-[#8b87a0]',
  info: 'bg-[#7dd3fc]',
  accent: 'bg-[#b49bff]',
  warn: 'bg-[#fbbf24]',
  ok: 'bg-[#4ade80]',
  danger: 'bg-[#f87171]',
}

/** Monospace uppercase micro-label: section titles, column headers, field labels. */
export const LABEL = 'font-mono text-[10.5px] font-medium tracking-[0.12em] text-[#7f7a95] uppercase'

/** The standard bordered surface. */
export const SURFACE = 'rounded-[8px] border border-white/[0.08] bg-[#0b0b0f]'

/** Form controls. */
export const CONTROL =
  'w-full rounded-[6px] border border-white/[0.1] bg-[#08080b] px-3 py-[9px] text-[13.5px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#5e5a72] focus:border-[#b49bff]/60 focus:shadow-[0_0_0_3px_rgba(180,155,255,0.12)] disabled:opacity-50'
