import { COMMUNITY_LINKS } from '@/data/community'
import type { CommunityChannel, ResolvedCommunityChannel } from '@/types/community'

/*
 * Joins a channel's editorial copy to its configured URL.
 *
 * This is the one place the two halves meet, which is what keeps the section
 * CMS-ready: when these links come from a site-settings API instead of
 * `data/community.ts`, this function changes and no component does.
 */

/**
 * Whether a configured value is something we are willing to navigate to.
 *
 * Deliberately strict about the scheme. The realistic mistakes when someone
 * fills this in later are pasting a handle ("@aitoolkart"), a bare domain
 * ("x.com/aitoolkart") or leaving a placeholder word behind — and every one of
 * those, dropped into an `href`, becomes a RELATIVE link that quietly navigates
 * inside our own app instead of failing visibly. Requiring http(s) turns all of
 * them into "this card is not configured yet", which is the honest outcome.
 *
 * `javascript:` and `data:` URLs are excluded by the same rule.
 */
export function isConfiguredLink(href: string | undefined): boolean {
  const value = href?.trim() ?? ''
  return /^https?:\/\/\S+$/i.test(value)
}

/** One channel, with `href` present only when it is genuinely usable. */
export function resolveCommunityChannel(channel: CommunityChannel): ResolvedCommunityChannel {
  const href = COMMUNITY_LINKS[channel.platform]?.trim()
  return isConfiguredLink(href) ? { ...channel, href } : { ...channel }
}

/** The same, for a list. Order is the caller's and is preserved. */
export function resolveCommunityChannels(
  channels: CommunityChannel[],
): ResolvedCommunityChannel[] {
  return channels.map(resolveCommunityChannel)
}
