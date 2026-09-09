/*
 * Community section types.
 *
 * Two layers, on purpose:
 *
 *  1. `CommunityChannel` — the EDITORIAL description of a channel: what it is
 *     called, whose handle it is, what you get there, what the button says. No
 *     URL. This is the part that reads like copy and changes rarely.
 *  2. `ResolvedCommunityChannel` — the same thing with its destination filled
 *     in from the link config, which is the part that changes when someone
 *     creates the real account.
 *
 * Splitting them is what makes the section CMS-ready: the components consume
 * `ResolvedCommunityChannel` and nothing else, so the day these come from a
 * site-settings API instead of `data/community.ts`, only the resolver changes.
 * Same shape the setup cards use (`AiSetup` / `ResolvedSetup`).
 */

/** The channels the final design ships. Also the keys of the link config. */
export type CommunityPlatform = 'discord' | 'x' | 'instagram' | 'youtube' | 'linkedin'

/** Where each platform points. One entry per platform, URLs only. */
export type CommunityLinks = Record<CommunityPlatform, string>

export interface CommunityChannel {
  platform: CommunityPlatform
  /** "X", "Instagram", … — the platform's name as the card shows it. */
  name: string
  /** "@aitoolkart", "AI Tool Kart" — whatever that platform calls an account. */
  handle: string
  description: string
  /** "Follow", "Subscribe", "Connect" — the design varies this per platform. */
  cta: string
}

export interface ResolvedCommunityChannel extends CommunityChannel {
  /**
   * The destination, or `undefined` when nothing usable is configured.
   *
   * `undefined` is a normal state, not an error: the card still renders, it
   * just does not navigate. See utils/community.ts.
   */
  href?: string
}
