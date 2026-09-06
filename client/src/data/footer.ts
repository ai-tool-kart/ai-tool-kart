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

/** Social destinations. The design links to the platform roots, not to accounts. */
export interface SocialLink {
  /** Which icon to draw. See components/layout/Footer.tsx. */
  id: 'discord' | 'x' | 'instagram'
  label: string
  href: string
  /** Discord carries its name beside the icon; the rest are icon-only squares. */
  showLabel?: boolean
}

export const FOOTER_SOCIALS: SocialLink[] = [
  { id: 'discord', label: 'Join our Discord', href: 'https://discord.com', showLabel: true },
  { id: 'x', label: 'Follow us on X', href: 'https://x.com' },
  { id: 'instagram', label: 'Follow us on Instagram', href: 'https://instagram.com' },
]

export const FOOTER_TAGLINE =
  "The world's most intuitive AI discovery platform. Independent, tested, dated."

export const FOOTER_COPYRIGHT = '© 2026 ai tool kart'
