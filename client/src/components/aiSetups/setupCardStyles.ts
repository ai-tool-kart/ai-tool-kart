/*
 * The setup card's surface, its CTA pill and its tool tile, drawn by
 * WorkflowCard on /workflows and the homepage's "AI for Your Work". Moved here
 * verbatim from the retired SetupCard and SetupToolStack — no visual change.
 *
 * The surface expects the tone custom properties (--acc, --glow, --t1) on the
 * same element; see setupTone.ts.
 */

export const SETUP_CARD_SURFACE =
  'group relative flex cursor-pointer flex-col gap-[14px] overflow-hidden rounded-panel border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.052)_0%,rgba(255,255,255,0.016)_100%)] p-5 text-left shadow-[inset_0_1px_0_rgba(224,212,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.4),0_22px_42px_-32px_rgba(0,0,0,0.95)] transition-[transform,border-color,box-shadow,background] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[5px] hover:border-[rgba(178,150,255,0.32)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.078)_0%,rgba(255,255,255,0.022)_100%)] hover:shadow-[inset_0_1px_0_rgba(240,232,255,0.3),0_2px_6px_rgba(0,0,0,0.45),0_30px_56px_-32px_var(--glow)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:translate-y-[-2px] active:scale-[0.995]'

/** "View Complete Workflow →". */
export const SETUP_CARD_CTA =
  'ml-auto inline-flex items-center gap-[7px] rounded-pill whitespace-nowrap border border-[rgba(178,150,255,0.26)] bg-[rgba(124,90,246,0.13)] px-[15px] py-2 text-[12.5px] font-semibold tracking-[-0.006em] text-[#D3C4FF] transition-[color,border-color,background] duration-300 group-hover:border-[rgba(214,192,255,0.55)] group-hover:bg-[rgba(124,90,246,0.26)] group-hover:text-white'

/**
 * One tile of a card's overlapping tool stack (WorkflowToolStack) — 36px
 * rounded squares, each pulled 9px over the one before it.
 */
export const TILE =
  'relative -ml-[9px] h-9 w-9 flex-none overflow-hidden rounded-[12px] border border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_6px_14px_-8px_rgba(0,0,0,0.95)]'
