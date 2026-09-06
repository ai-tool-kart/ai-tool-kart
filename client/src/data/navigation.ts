/*
 * Primary nav, ported from the `nav` array in the final design
 * (ai-tool-kart-pre-final-design/project/AI Tool Kart Site.dc.html, renderVals()):
 *
 *   Browse · Workflows · New Launches · Our AI Assistant · Blog · Community
 *
 * "Workflows" is new in this export; the earlier one had five items. Pricing and
 * the "Sign in / Get started free" pair are absent from the design and from the
 * product direction, so they are absent here too.
 *
 * The prototype routed by in-memory `state.page` and tracked the selected item
 * separately in `state.navKey`, which let two items share a destination while
 * only one looked selected. React derives the active state from the URL instead,
 * so an item that shares a destination opts out of the active treatment via
 * `matchesRoute: false` — otherwise three items would light up on /browse.
 *
 * Workflows, New Launches, Our AI Assistant and Community point at existing
 * routes on purpose: the design has a screen for each, but those screens are not
 * built yet and a nav link to a 404 is worse than one that lands somewhere
 * sensible. Each gains its own route in the milestone that builds it.
 */

export interface NavItem {
  label: string
  to: string
  /** False when another item owns this destination's active state. Defaults to true. */
  matchesRoute?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Browse', to: '/browse' },
  { label: 'Workflows', to: '/browse', matchesRoute: false },
  { label: 'New Launches', to: '/browse', matchesRoute: false },
  { label: 'Our AI Assistant', to: '/', matchesRoute: false },
  { label: 'Blog', to: '/blog' },
  { label: 'Community', to: '/', matchesRoute: false },
]
