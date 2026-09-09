import { COMMUNITY_LINKS } from '@/data/community'
import { isConfiguredLink } from '@/utils/community'

/*
 * Footer content, ported from `footerCols` and the social rail in the final
 * design (ai-tool-kart-pre-final-design/project/AI Tool Kart Site.dc.html,
 * <footer id="contact">).
 *
 * The column link labels have no destinations in the design — they are plain
 * divs with a hover colour and no click handler. They are kept inert here rather
 * than inventing routes for them; the social links, by contrast, are real
 * anchors in the source and stay real anchors.
 */

export interface FooterColumn {
  title: string
  links: string[]
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Catalog',
    links: ['Browse all tools', 'Categories', 'New this week', 'Trending', 'Compare tools'],
  },
  {
    title: 'Company',
    links: ['How we test', 'Editorial policy', 'Careers', 'Press kit'],
  },
  {
    title: 'Get in touch',
    links: ['Submit a tool', 'Ask the editors', 'Report a listing', "Advertise (we don't)"],
  },
]

/*
 * Social destinations.
 *
 * The URLs are NOT written here. They come from COMMUNITY_LINKS in
 * data/community.ts, which the homepage Community section reads too — so the
 * real account links get pasted in exactly one place and both surfaces follow.
 * Before that they were duplicated, and the footer would have kept pointing at
 * discord.com after the Community section was updated.
 *
 * A channel with no usable URL configured drops out of the rail rather than
 * rendering a dead icon; see `isConfiguredLink`.
 */
export interface SocialLink {
  /** Which icon to draw. See components/layout/Footer.tsx. */
  id: 'discord' | 'x' | 'instagram'
  label: string
  href: string
  /** Discord carries its name beside the icon; the rest are icon-only squares. */
  showLabel?: boolean
}

/** The three the design puts in the footer, of the five the site configures. */
const FOOTER_SOCIAL_COPY: { id: SocialLink['id']; label: string; showLabel?: boolean }[] = [
  { id: 'discord', label: 'Join our Discord', showLabel: true },
  { id: 'x', label: 'Follow us on X' },
  { id: 'instagram', label: 'Follow us on Instagram' },
]

export const FOOTER_SOCIALS: SocialLink[] = FOOTER_SOCIAL_COPY.flatMap((social) => {
  const href = COMMUNITY_LINKS[social.id]?.trim()
  return isConfiguredLink(href) ? [{ ...social, href }] : []
})

export const FOOTER_TAGLINE =
  "The world's most intuitive AI discovery platform. Independent, tested, dated."

export const FOOTER_COPYRIGHT = '© 2026 ai tool kart'
