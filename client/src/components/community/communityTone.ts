import type { CSSProperties } from 'react'
import type { CardTone } from '@/components/catalogue/toolCardTone'
import type { CommunityPlatform } from '@/types/community'

/*
 * The per-platform colours the Community cards are lit with.
 *
 * Source: AI Tool Kart Site.dc.html, `data-screen-label="Community"` — the
 * `socialLinks` entries' `acc` / `glow` / `t1` / `t2`, plus the Discord card's
 * own inline set.
 *
 * ── Keyed on the PLATFORM, not on position ───────────────────────────────────
 *
 * Every other palette in this app (catalogue, recently-added, blog insights) is
 * keyed on index, because there the colour is a rhythm across a grid and must
 * not look like information. Here it is the opposite: the tint IS the platform's
 * identity — YouTube's red, LinkedIn's blue, Instagram's magenta — and rotating
 * it by position would be the mistake.
 *
 * `CardTone` is the catalogue card's own type rather than a fifth copy of the
 * same four fields: `--acc` / `--glow` / `--t1` / `--t2` are a shared contract
 * with [data-spot-layer] and [data-spot-edge] in styles/index.css.
 */

const TONES: Record<CommunityPlatform, CardTone> = {
  /* The Discord card is the section's pink anchor. */
  discord: {
    accent: '#F2A6C0',
    glow: 'rgba(228,116,152,0.55)',
    tint: 'rgba(240,160,186,0.17)',
    tintStrong: 'rgba(240,160,186,0.32)',
  },
  /* X has no brand colour to borrow, so the design gives it the neutral chrome. */
  x: {
    accent: '#C9C2DE',
    glow: 'rgba(200,200,220,0.4)',
    tint: 'rgba(255,255,255,0.1)',
    tintStrong: 'rgba(255,255,255,0.18)',
  },
  instagram: {
    accent: '#E8A5D6',
    glow: 'rgba(226,132,201,0.5)',
    tint: 'rgba(226,132,201,0.14)',
    tintStrong: 'rgba(226,132,201,0.3)',
  },
  youtube: {
    accent: '#F09A9A',
    glow: 'rgba(230,110,110,0.45)',
    tint: 'rgba(240,154,154,0.13)',
    tintStrong: 'rgba(240,154,154,0.28)',
  },
  linkedin: {
    accent: '#93B4FF',
    glow: 'rgba(105,140,255,0.5)',
    tint: 'rgba(147,180,255,0.14)',
    tintStrong: 'rgba(147,180,255,0.3)',
  },
}

/** The custom properties the design drives its per-card colours through. */
export interface ToneVars extends CSSProperties {
  '--acc': string
  '--glow': string
  '--t1': string
  '--t2': string
}

/** The four custom properties for a platform, ready to spread onto `style`. */
export function toneVarsFor(platform: CommunityPlatform): ToneVars {
  const tone = TONES[platform]
  return {
    '--acc': tone.accent,
    '--glow': tone.glow,
    '--t1': tone.tint,
    '--t2': tone.tintStrong,
  }
}
