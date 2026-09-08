import type { SetupToneName } from '@/types/aiSetup'

/*
 * The five accents the handoff rotates across the setup cards.
 *
 * Source: the `acc` / `glow` / `t1` triples on each entry of `AI_SETUPS`.
 *
 * ── Why this is not components/catalogue/toolCardTone.ts ─────────────────────
 *
 * That palette is four tones applied BY POSITION — a rhythm across the Browse
 * grid, explicitly not information about the tool. A setup's tone is EDITORIAL
 * and travels with the setup: "Product Image Workflow" is sand under the All
 * chip, under Image Generation and, later, on the Workflows screen, because the
 * handoff assigns it there. Merging the two would make one of those two things
 * untrue, and this palette carries a fifth colour the other does not.
 *
 * One normalisation: the handoff writes two nearly identical violets (glow at
 * 0.70 vs 0.75 alpha, tint at 0.16 vs 0.18) and two nearly identical sands.
 * Those differences are below the threshold of a shadow behind a card, so each
 * pair is collapsed to the more common variant.
 */

export interface SetupTone {
  /** --acc: the cursor-tracking edge rim. */
  accent: string
  /** --glow: the colour the card's hover shadow is cast in. */
  glow: string
  /** --t1: the spotlight's core. */
  tint: string
}

export const SETUP_TONES: Record<SetupToneName, SetupTone> = {
  violet: { accent: '#A78BFA', glow: 'rgba(124,88,244,0.7)', tint: 'rgba(167,139,250,0.16)' },
  sky: { accent: '#7DD3FC', glow: 'rgba(80,180,240,0.6)', tint: 'rgba(125,211,252,0.16)' },
  pink: { accent: '#E8A5D6', glow: 'rgba(226,132,201,0.55)', tint: 'rgba(226,132,201,0.16)' },
  blue: { accent: '#93B4FF', glow: 'rgba(105,140,255,0.6)', tint: 'rgba(147,180,255,0.16)' },
  sand: { accent: '#E5C48C', glow: 'rgba(214,164,84,0.55)', tint: 'rgba(229,196,140,0.16)' },
}
