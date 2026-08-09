/*
 * Primary nav, ported from the `nav` array in the Claude Design handoff
 * (AI Tool Kart Site.dc.html, renderVals()).
 *
 * The prototype switched views via in-memory `state.page`; here each key becomes
 * a real route path. Home is reachable through the logo only, exactly as in the
 * design — it is not a nav item.
 */

export interface NavItem {
  label: string
  to: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Browse', to: '/browse' },
  { label: 'Compare', to: '/compare' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Submit a tool', to: '/submit' },
]
