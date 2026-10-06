/*
 * The setup chip — the single-select filter pill the homepage's "AI for Your
 * Work" row and the /workflows niche row both draw (WorkflowNicheChips).
 *
 * Source: AI Tool Kart Site.dc.html, the `workCats` row — the selected chip
 * carrying the violet fill and its lift shadow. Moved here verbatim from the
 * retired SetupCategoryChips — no visual change.
 */

export const CHIP =
  'cursor-pointer rounded-pill border px-4 py-[9px] text-[13.5px] font-semibold tracking-[-0.012em] whitespace-nowrap transition-[color,border-color,background,box-shadow,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent'

export const ACTIVE =
  'border-[rgba(178,150,255,0.5)] bg-[linear-gradient(180deg,rgba(124,90,246,0.34)_0%,rgba(84,54,190,0.26)_100%)] text-[#F3EEFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_-18px_rgba(116,80,244,0.9)]'

export const IDLE =
  'border-white/[0.085] bg-white/[0.028] text-[#9A94B4] hover:border-[rgba(178,150,255,0.32)] hover:text-[#EFE9FF]'
