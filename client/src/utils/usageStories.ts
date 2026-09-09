import type { ToolIndex } from '@/services/tools'
import type { ResolvedUsageStory, UsageStory } from '@/types/usageStory'
import type { Tool } from '@/types/tool'

/*
 * Turning a story's tool REFERENCES into real catalogue records.
 *
 * This is the one place a slug becomes a tool. The story data carries no tool
 * names, so a chip's label can only ever be the catalogue's own — which means a
 * renamed tool is renamed on every card the moment the catalogue says so, and
 * there is no second copy to find and fix.
 */

/**
 * Resolves a story's slugs against the catalogue index.
 *
 * Order is the STORY's, not the index's: the slugs are written in the order the
 * person used the tools, and re-sorting them would quietly discard that.
 *
 * A slug the catalogue does not have is collected into `unresolvedSlugs` rather
 * than dropped silently or rendered as a bare slug. The card shows nothing for
 * it — inventing a display name for a tool the catalogue has never heard of is
 * exactly the fabrication this whole reference scheme exists to prevent — and
 * the section logs it once in development so a content bug is visible to whoever
 * can fix it.
 */
export function resolveUsageStory(
  story: UsageStory,
  index: ToolIndex | undefined,
): ResolvedUsageStory {
  const tools: Tool[] = []
  const unresolvedSlugs: string[] = []

  for (const slug of story.toolSlugs) {
    const tool = index?.get(slug)
    if (tool) tools.push(tool)
    // While the index is still loading nothing is "unresolved" — it is simply
    // not known yet, and reporting it would fire on every first render.
    else if (index) unresolvedSlugs.push(slug)
  }

  return { story, tools, unresolvedSlugs }
}

/**
 * The initials shown when a story has no portrait.
 *
 * Derived from the person's name when there is one — "Maya R." becomes "MR" —
 * and from the role otherwise, so an anonymous story still gets a mark rather
 * than an empty circle. At most two letters: three in a 60px circle stops
 * reading as a monogram and starts reading as a word.
 *
 * This is a FALLBACK, not a placeholder to be apologised for. It is the same
 * decision the featured tiles make for a tool with no logo: show the identity
 * the record actually carries rather than an empty frame. No stock portrait is
 * bundled and none is fetched — a photograph of a person who does not exist is
 * the one detail that would make an illustrative card look like a real customer.
 */
export function storyInitials(story: UsageStory): string {
  const source = story.personName?.trim() || story.role
  const letters = source
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => word[0] ?? '')
    .join('')
  return letters.slice(0, 2).toUpperCase()
}

/**
 * The line under the role: "Maya R. · Lisbon", or whichever half exists.
 *
 * Returns '' when the story carries neither, which the card renders as nothing
 * rather than as an empty row holding space open.
 */
export function storyByline(story: UsageStory): string {
  return [story.personName, story.location].filter(Boolean).join(' · ')
}
