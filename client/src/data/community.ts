import type { CommunityChannel, CommunityLinks } from '@/types/community'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  COMMUNITY LINKS — the single source of truth for every social destination
 *  on this site (the homepage Community section AND the footer's social rail).
 *
 *  ▸ TO POINT THE SITE AT THE REAL ACCOUNTS, EDIT `COMMUNITY_LINKS` BELOW.
 *    Nothing else needs to change. No other file contains one of these URLs.
 *
 *  Each value must be a full absolute URL beginning with https:// — a bare
 *  handle ("@aitoolkart") or a placeholder string is rejected by
 *  utils/community.ts and the card renders inert rather than navigating
 *  somewhere wrong. Leave a value as '' to take a channel offline: its card
 *  keeps its place in the layout but stops being a link.
 *
 *  The values shipped here are the handoff's own — the platform front doors,
 *  which is what the prototype linked to and what the footer has linked to
 *  since it was built. They are placeholders for real account URLs, not
 *  destinations anyone chose.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const COMMUNITY_LINKS: CommunityLinks = {
  discord: 'https://discord.com',
  x: 'https://x.com',
  instagram: 'https://instagram.com',
  youtube: 'https://youtube.com',
  linkedin: 'https://linkedin.com',
}

/*
 * Why a frontend config rather than the server:
 *
 * These are five static strings that change when someone creates an account,
 * which is roughly never. The server has no site-settings resource to put them
 * in, and adding one — plus a table, an endpoint and a fetch — to serve five
 * constants would mean the footer could not render until an API call returned.
 * `data/navigation.ts` and `data/footer.ts` already treat site chrome this way.
 * Env vars are used in this project only for service endpoints
 * (VITE_API_URL, VITE_WORDPRESS_API_URL), not for content, so they are wrong here.
 *
 * If a site-settings resource ever exists, this file becomes its fallback and
 * `resolveCommunityChannels` becomes the merge point. No component changes.
 */

/*
 * The community proof row's copy.
 *
 * ── The numbers are editorial placeholders, not measurements ─────────────────
 *
 * "190,000" and "+186K members" are the handoff's marketing copy. Nothing in
 * this product counts community members: there is no members table, no Discord
 * widget call, and no social API. They are kept verbatim for design fidelity
 * and isolated here so they can be corrected in one edit the moment a real
 * source exists — do NOT scatter them into components.
 *
 * The handoff's two figures disagree with each other (190,000 in the sentence,
 * 186K in the pill). Both are reproduced as written rather than silently
 * reconciled, because picking one would be inventing a number too.
 */
export const COMMUNITY_PROOF = {
  /** Sits under the section heading. Contains an unverified count. */
  intro: 'Connect. Learn. Share. Grow together — with 190,000 people building in the open.',
  headline: 'Real reviewers, honest takes, zero vendor scripts',
  description:
    "Ask for a stack, post what you built, get told straight when a tool isn't worth the subscription.",
  /** Unverified count. See above. */
  memberCount: '+186K members',
  /** How many overlapping circles the design draws. They carry no portraits. */
  avatarCount: 5,
} as const

/** The wide feature card. Its "Start here" badge is the design's, not a flag. */
export const DISCORD_CHANNEL: CommunityChannel = {
  platform: 'discord',
  name: 'Discord',
  handle: 'Start here',
  description:
    "Ask for a stack, post what you built, and get told straight when a tool isn't worth the subscription.",
  cta: 'Join the server',
}

/** The four compact cards, in the handoff's order. */
export const SOCIAL_CHANNELS: CommunityChannel[] = [
  {
    platform: 'x',
    name: 'X',
    handle: '@aitoolkart',
    description: 'Launch notes, one-line verdicts and the odd teardown.',
    cta: 'Follow',
  },
  {
    platform: 'instagram',
    name: 'Instagram',
    handle: '@aitoolkart',
    description: 'Short walkthroughs and before-and-after builds.',
    cta: 'Follow',
  },
  {
    platform: 'youtube',
    name: 'YouTube',
    handle: 'AI Tool Kart',
    description: 'Full workflow runs, start to shipped, unedited.',
    cta: 'Subscribe',
  },
  {
    platform: 'linkedin',
    name: 'LinkedIn',
    handle: 'AI Tool Kart',
    description: 'How teams are standardising their AI stacks.',
    cta: 'Connect',
  },
]
