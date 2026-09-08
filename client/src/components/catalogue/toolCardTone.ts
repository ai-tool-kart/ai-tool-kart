import type { PricingModel, Tool } from '@/types/tool'

/*
 * The values a card DERIVES from a tool: its tone rotation, its pricing colour,
 * its call-to-action wording and its badge.
 *
 * Kept out of the components so the card and its skeleton share one palette,
 * and so a caller can ask a question — "does this tool earn a badge?" — without
 * rendering anything.
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

/*
 * ── Where a badge comes from, and why most cards have none ───────────────────
 *
 * The catalogue HAS a `badge` field — `z.string().max(40)` in the server's
 * schema — and when it is set, it wins outright. It is the curator's own words
 * and nothing here should second-guess them.
 *
 * It is empty on all 66 seeded records, though, alongside `rating`, `reviews`,
 * `trend` and `verified`, which are 0 / 0 / "" / true on every single tool.
 * Those five carry no information at all right now, so nothing can be derived
 * from them without inventing it.
 *
 * `pop` is the exception. It varies — 95×12, 85×10, 70×22, 55×13, 40×9 — and
 * the server names those exact thresholds in `PROMINENCE`
 * (household / major / established / growing / niche), describing them as "how
 * widely known and adopted a tool is, as judged by whoever curates the
 * catalogue". Surfacing the top two bands is therefore restating an editorial
 * judgement the catalogue already made, in the catalogue's own vocabulary —
 * not manufacturing one. 22 of 66 cards carry a badge, which keeps it a signal
 * rather than decoration.
 *
 * What is deliberately NOT done: no "Editors' pick" or "Fastest growing"
 * inferred from a tool's name or category. Those are factual claims about real
 * third-party products, and the seed catalogue's own convention is to record
 * "not recorded" rather than fabricate — see NOT_RECORDED in the server's
 * taxonomy. A badge that flatters a vendor the catalogue never assessed is the
 * one thing a tool directory must not print.
 */

/** The server's `PROMINENCE` thresholds, and the label each earns. */
const PROMINENCE_BADGES: ReadonlyArray<{ min: number; label: string }> = [
  { min: 95, label: 'Widely used' },
  { min: 85, label: 'Popular' },
]

/**
 * The badge a tool should show, or undefined for none.
 *
 * Exported so a caller can ask the question without rendering — a compact list
 * that has no room for a badge still wants to know whether one exists.
 */
export function badgeFor(tool: Tool): string | undefined {
  const curated = tool.badge.trim()
  if (curated) return curated
  return PROMINENCE_BADGES.find((band) => tool.pop >= band.min)?.label
}
