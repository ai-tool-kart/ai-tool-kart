/*
 * Hero content, ported from the final design
 * (ai-tool-kart-pre-final-design/project/AI Tool Kart Site.dc.html):
 * HERO_CHAIN, the `kindTabs` array in renderVals(), and QUICK_TASKS.
 */

/** The word the headline types and backspaces through. */
export const HERO_WORD_CHAIN = ['Task', 'Job', 'Niche', 'Business', 'Goal'] as const

/**
 * The three catalogue kinds offered above the headline.
 *
 * In the design this selection drives nothing but its own highlight — no filter,
 * no query, no navigation — so it is reproduced as exactly that here. It becomes
 * a real filter when the catalogue distinguishes the three kinds; inventing that
 * behaviour now would be inventing a feature.
 */
export type HeroKindIcon = 'workflows' | 'agents' | 'mcp'

export interface HeroKind {
  label: string
  icon: HeroKindIcon
}

export const HERO_KINDS: HeroKind[] = [
  { label: 'AI Workflows', icon: 'workflows' },
  { label: 'AI Agents', icon: 'agents' },
  { label: 'MCP Servers', icon: 'mcp' },
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
