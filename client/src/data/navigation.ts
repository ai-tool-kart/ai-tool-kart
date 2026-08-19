/*
 * Primary nav, ported from the `nav` array in the latest design
 * (ai tool kart ui design v2/AI Tool Kart Site.dc.html, renderVals(), ~line 1846):
 *
 *   Browse · New Launches · Our AI Assistant · Blog · Community
 *
 * Pricing and the "Sign in / Get started free" pair are gone from that design and
 * from the product direction, so they are gone from here too.
 *
 * The prototype routed by in-memory `state.page` and tracked the selected item
 * separately in `state.navKey`, which let two items share a destination while
 * only one looked selected. React derives the active state from the URL instead,
 * so items that share a destination with another opt out of the active treatment
 * via `matchesRoute: false` — otherwise "Browse" and "New Launches" would both
 * light up on /browse. They still navigate exactly where the design sends them;
 * each gains its own route once that view is designed.
 */

export interface NavItem {
  label: string
  to: string
  /** False when another item owns this destination's active state. Defaults to true. */
  matchesRoute?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Browse', to: '/browse' },
  { label: 'New Launches', to: '/browse', matchesRoute: false },
  { label: 'Our AI Assistant', to: '/', matchesRoute: false },
  { label: 'Blog', to: '/blog' },
  { label: 'Community', to: '/', matchesRoute: false },
]
