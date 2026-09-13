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
 * `matchesRoute: false`. Two still do: Our AI Assistant and Community both
 * resolve to the homepage, so without it they would light up together, and with
 * Community's fragment they would light up on every homepage visit.
 *
 * Workflows points at an existing route on purpose: the design has a screen for
 * it, that screen is not built yet, and a nav link to a 404 is worse than one
 * that lands somewhere sensible. It gains its own route in the milestone that
 * builds it — New Launches already has.
 *
 * Our AI Assistant and Community are different: neither is a missing screen.
 * Both are sections of the homepage in the final design, so both are fragment
 * links to the section itself rather than placeholders waiting for a route.
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
 * journey and must never disagree, and `WORKFLOWS_ROUTE` is read by both the nav
 * item and the "Share an AI Setup" card, so the two cannot drift apart.
 */

/** Where "Submit Your Tool" and the closing CTA's "Submit" both go. */
export const SUBMIT_ROUTE = '/submit'

/**
 * The AI setup library.
 *
 * A real screen as of this change (pages/WorkflowsPage.tsx). It pointed at
 * '/browse' for as long as there was nothing behind the label — the nav has
 * carried "Workflows" since the final design's export, and a link to Browse was
 * judged better than a link to a 404. That placeholder is now retired.
 *
 * Anything pointing at "Workflows" reads this constant rather than the literal,
 * so the nav item and the "Share an AI Setup" card move together.
 */
export const WORKFLOWS_ROUTE = '/workflows'

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

/**
 * The assistant stage's element id, and the nav link that reaches it.
 *
 * The assistant is not a page. The final design puts it directly under the hero
 * search as the homepage's centrepiece — one two-pane stage that the search box,
 * the composer, "Let's Build" and the setup cards all talk to — so "Our AI
 * Assistant" is a fragment link to that stage, exactly as Community is to its
 * section, and NOT a route invented to give the nav item somewhere to go.
 *
 * It pointed at `/` before this, which meant the item did nothing at all for the
 * reader most likely to click it: someone already on the homepage, above the
 * stage, looking for the assistant.
 *
 * The id lives here because two files must agree on it — the stage that carries
 * it and this link — and a fragment that misses its target fails silently.
 */
export const ASSISTANT_SECTION_ID = 'ai-assistant'
export const ASSISTANT_ROUTE = `/#${ASSISTANT_SECTION_ID}`

export const NAV_ITEMS: NavItem[] = [
  { label: 'Browse', to: '/browse' },
  { label: 'Workflows', to: WORKFLOWS_ROUTE },
  { label: 'New Launches', to: LAUNCHES_ROUTE },
  { label: 'Our AI Assistant', to: ASSISTANT_ROUTE, matchesRoute: false },
  { label: 'Blog', to: '/blog' },
  { label: 'Community', to: COMMUNITY_ROUTE, matchesRoute: false },
]
