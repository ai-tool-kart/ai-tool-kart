/*
 * Footer content, ported from `footerCols` in the Claude Design handoff
 * (AI Tool Kart Site.dc.html, renderVals()).
 *
 * The link labels have no destinations in the design — they are plain divs with
 * a hover colour and no click handler. They are kept inert here rather than
 * inventing routes for them.
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

export const FOOTER_TAGLINE =
  "The world's most intuitive AI discovery platform. Independent, tested, dated."

export const FOOTER_COPYRIGHT = '© 2026 ai tool kart'
