import type { CardTone } from '@/components/catalogue/toolCardTone'

/*
 * The warm palette Home's Blog & Insights cards use.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Blog"` — the two
 * `insightPosts` entries carry `acc` / `glow` / `t1` values that are sand and
 * ember rather than the site's violet, which is what keeps this section reading
 * as editorial next to the violet catalogue sections above it.
 *
 * Keyed on INDEX, exactly as the design keys it: the rotation is a rhythm down
 * the row, not information about the article. Colouring by category would make
 * it look like a taxonomy nobody defined.
 *
 * `CardTone` is the catalogue card's own type rather than a fourth copy of the
 * same fields — `--acc` / `--glow` / `--t1` / `--t2` are a shared contract with
 * [data-spot-layer] and [data-spot-edge] in styles/index.css, and they must not
 * drift. `tintStrong` has no design value here (these cards draw no monogram
 * border), so it repeats `tint` at the strength the other palettes use.
 */

const WARM_PALETTE: readonly CardTone[] = [
  {
    accent: '#EBD3A6',
    glow: 'rgba(178,132,58,0.55)',
    tint: 'rgba(230,210,172,0.14)',
    tintStrong: 'rgba(230,210,172,0.28)',
  },
  {
    accent: '#F0B79A',
    glow: 'rgba(214,120,80,0.5)',
    tint: 'rgba(240,183,154,0.13)',
    tintStrong: 'rgba(240,183,154,0.28)',
  },
]

/** The tone for the card at a given position in the secondary row. */
export function warmToneForIndex(index: number): CardTone {
  return WARM_PALETTE[index % WARM_PALETTE.length] as CardTone
}
