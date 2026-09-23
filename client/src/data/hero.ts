import { MCP_SERVERS_ROUTE } from '@/data/navigation'

/*
 * Hero content, ported from the final design
 * (ai-tool-kart-pre-final-design/project/AI Tool Kart Site.dc.html):
 * HERO_CHAIN, the `kindTabs` array in renderVals(), and QUICK_TASKS.
 */

/** The word the headline types and backspaces through. */
export const HERO_WORD_CHAIN = ['Task', 'Job', 'Niche', 'Business', 'Goal'] as const

/**
 * The catalogue kinds offered above the headline.
 *
 * In the design this selection drove nothing but its own highlight — no
 * filter, no query, no navigation. Now both kinds are real destinations: Home
 * ("AI Workflows") and /mcp-servers ("MCP Servers") each render this same Hero,
 * so KindTabs is a real switcher between the two pages, with the active pill
 * derived from the current route rather than from local state — see KindTabs,
 * which reads `location.pathname` against each kind's `to`.
 *
 * The handoff offers three. "AI Agents" was dropped by product decision, so the
 * union below no longer carries an `agents` icon either — this list is the only
 * thing that decides what the rail renders, and KindTabs draws one icon per
 * member of the union, so an unused member would be an unused drawing.
 *
 * NOTE: this is unrelated to the assistant's own 'agents' plan section in
 * data/assistant.ts, which is a different vocabulary and is untouched.
 */
export type HeroKindIcon = 'workflows' | 'mcp'

export interface HeroKind {
  label: string
  icon: HeroKindIcon
  /** The route this kind switches to. Every kind is a real destination now. */
  to: string
}

export const HERO_KINDS: HeroKind[] = [
  { label: 'AI Workflows', icon: 'workflows', to: '/' },
  { label: 'MCP Servers', icon: 'mcp', to: MCP_SERVERS_ROUTE },
]

/** Suggested tasks under the hero search. */
export const QUICK_TASKS: string[] = [
  'Grow my restaurant',
  'Edit videos faster',
  'Automate client follow-ups',
  'Study smarter',
]

/** The index line above the headline. Editorial copy in the design, not derived. */
export const HERO_INDEX_LINE = '2,412 AI tools, workflows & prompts indexed'
