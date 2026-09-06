import type { PricingModel, Tool } from '@/types/tool'

/*
 * The card's colour logic, kept out of the component so both the card and its
 * skeleton can share the rotation and neither owns a palette.
 *
 * Source: AI Tool Kart Site.dc.html — the `pal` array in the browse `results`
 * mapping and `priceTone()`.
 */

/** Violet · sky · pink · sand, cycled by position. The design's `pal`. */
export interface CardTone {
  /** --acc: the edge-glow accent. */
  accent: string
  /** --glow: the lift shadow's colour. */
  glow: string
  /** --t1: the media band's wash and the spotlight's core. */
  tint: string
  /** --t2: the monogram's border. */
  tintStrong: string
}

const PALETTE: CardTone[] = [
  {
    accent: '#A78BFA',
    glow: 'rgba(124,88,244,0.55)',
    tint: 'rgba(167,139,250,0.18)',
    tintStrong: 'rgba(167,139,250,0.32)',
  },
  {
    accent: '#7DD3FC',
    glow: 'rgba(80,180,240,0.5)',
    tint: 'rgba(125,211,252,0.15)',
    tintStrong: 'rgba(125,211,252,0.3)',
  },
  {
    accent: '#E8A5D6',
    glow: 'rgba(226,132,201,0.5)',
    tint: 'rgba(226,132,201,0.15)',
    tintStrong: 'rgba(226,132,201,0.3)',
  },
  {
    accent: '#E5C48C',
    glow: 'rgba(214,172,104,0.45)',
    tint: 'rgba(229,196,140,0.14)',
    tintStrong: 'rgba(229,196,140,0.3)',
  },
]

/**
 * The tone for a card at a given position.
 *
 * Keyed on INDEX, exactly as the design is: the rotation is a rhythm across the
 * grid, not a meaning attached to a tool. Keying it on category would make the
 * colour look like information it is not.
 */
export function toneForIndex(index: number): CardTone {
  return PALETTE[index % PALETTE.length] as CardTone
}

/** The design's `priceTone()`: green for free, sand for freemium, violet otherwise. */
export interface PriceTone {
  fg: string
  border: string
  background: string
}

export function priceTone(model: PricingModel): PriceTone {
  if (model === 'Free') {
    return { fg: '#9BE7C4', border: 'rgba(120,220,170,0.3)', background: 'rgba(84,196,146,0.12)' }
  }
  if (model === 'Freemium') {
    return { fg: '#E5C48C', border: 'rgba(229,196,140,0.3)', background: 'rgba(229,196,140,0.11)' }
  }
  return { fg: '#B9A6F5', border: 'rgba(167,139,250,0.32)', background: 'rgba(124,88,244,0.14)' }
}

/**
 * The primary button's label.
 *
 * The design chooses between "Start free" and "See pricing" from the pricing
 * model, and that still holds against real records: `pricingTier` is the
 * catalogue's own three-value axis and says the same thing more directly.
 */
export function ctaLabel(tool: Tool): string {
  return tool.pricingTier === 'paid' ? 'See pricing' : 'Start free'
}
