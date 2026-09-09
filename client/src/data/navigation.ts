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
 * Workflows and Our AI Assistant point at existing routes on purpose: the
 * design has a screen for each, but those screens are not built yet and a nav
 * link to a 404 is worse than one that lands somewhere sensible. Each gains its
 * own route in the milestone that builds it — New Launches already has, and
 * Community is now a fragment on the homepage.
 */

export interface NavItem {
  label: string
  to: string
  /** False when another item owns this destination's active state. Defaults to true. */
  matchesRoute?: boolean
}

/*
 * Named destinations, for the places outside this file that must land where the
 * nav lands.
 *
 * Both are single-sourced rather than repeated as string literals, because both
 * are duplicated somewhere the duplicate would silently rot: the nav pill's
 * "Submit Your Tool" CTA and the closing "Submit a Tool" card are the same
 * journey and must never disagree, and `WORKFLOWS_ROUTE` is a placeholder that
 * will move the day Workflows gets a screen — at which point one edit here
 * updates the nav item and the "Share an AI Setup" card together.
 */

/** Where "Submit Your Tool" and the closing CTA's "Submit" both go. */
export const SUBMIT_ROUTE = '/submit'

/**
 * Where "Workflows" goes TODAY.
 *
 * There is no `/workflows` route yet — see App.tsx — and the nav has always
 * sent this label to Browse rather than to a 404. Anything else pointing at
 * "Workflows" reads this constant so it follows the nav, including the day the
 * real screen arrives and this becomes '/workflows'.
 */
export const WORKFLOWS_ROUTE = '/browse'

/**
 * The chronological catalogue view.
 *
 * A real screen as of this milestone — the nav item pointed at Browse before
 * one existed. Named here so the nav item and anything else linking to it stay
 * on one string.
 */
export const LAUNCHES_ROUTE = '/new-launches'

/**
 * The Community section's element id, and the link that reaches it.
 *
 * Community is a section of the homepage, not a page, so the nav item is a
 * fragment link rather than a route. The id is single-sourced because it lives
 * in two files that must agree — the `<section>` that carries it and the link
 * that targets it — and a fragment that misses its target fails silently.
 *
 * Scrolling to it is components/layout/ScrollToTop.tsx's job; React Router does
 * not act on a hash by itself.
 */
export const COMMUNITY_SECTION_ID = 'community'
export const COMMUNITY_ROUTE = `/#${COMMUNITY_SECTION_ID}`

export const NAV_ITEMS: NavItem[] = [
  { label: 'Browse', to: '/browse' },
  { label: 'Workflows', to: WORKFLOWS_ROUTE, matchesRoute: false },
  { label: 'New Launches', to: LAUNCHES_ROUTE },
  { label: 'Our AI Assistant', to: '/', matchesRoute: false },
  { label: 'Blog', to: '/blog' },
  { label: 'Community', to: COMMUNITY_ROUTE, matchesRoute: false },
]
