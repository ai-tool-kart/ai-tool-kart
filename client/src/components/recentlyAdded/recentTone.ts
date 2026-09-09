import type { CardTone } from '@/components/catalogue/toolCardTone'

/*
 * The cool palette "Recently Added Tools" uses instead of the catalogue card's
 * violet / sky / pink / sand rotation.
 *
 * Source: AI Tool Kart Site.dc.html — the `cool` array applied over
 * `recentTools`, which overwrites each prototype card's own accent so the whole
 * rail reads as one blue-lit band. Three tones, cycled by position, exactly as
 * the handoff cycles them.
 *
 * Keyed on INDEX, not on the tool: the rotation is a rhythm across the rail, and
 * colouring by category or by age would make it look like information it is not.
 *
 * `CardTone` is the catalogue card's own type rather than a second copy of the
 * same four fields — the four CSS custom properties (`--acc`, `--glow`, `--t1`,
 * `--t2`) are a shared contract with [data-spot-layer] and [data-spot-edge] in
 * styles/index.css, and they must not drift.
 */

const COOL_PALETTE: readonly CardTone[] = [
  {
    accent: '#8FB4FF',
    glow: 'rgba(80,130,255,0.5)',
    tint: 'rgba(143,180,255,0.15)',
    tintStrong: 'rgba(143,180,255,0.3)',
  },
  {
    accent: '#7DD3FC',
    glow: 'rgba(80,180,240,0.5)',
    tint: 'rgba(125,211,252,0.14)',
    tintStrong: 'rgba(125,211,252,0.3)',
  },
  {
    accent: '#A9C7FF',
    glow: 'rgba(120,160,255,0.45)',
    tint: 'rgba(169,199,255,0.14)',
    tintStrong: 'rgba(169,199,255,0.28)',
  },
]

/** The tone for the card at a given position on the rail. */
export function coolToneForIndex(index: number): CardTone {
  return COOL_PALETTE[index % COOL_PALETTE.length] as CardTone
}
