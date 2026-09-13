import type { AiSetup, ResolvedSetup, SetupCategory } from '@/types/aiSetup'
import type { ToolIndex } from '@/services/tools'

/*
 * Everything the setup section computes, as pure functions.
 *
 * Resolution, filtering and the meta line are all derivations from an editorial
 * definition plus the live catalogue. Keeping them here means the same three
 * answers are available to the Workflows screen and a future setup detail view
 * without any of them going through a React component, and it means each one can
 * be reasoned about — and later tested — without mounting anything.
 */

/**
 * Attaches the live catalogue records a setup refers to.
 *
 * Order is the setup's own, so the tool stack always reads left to right in the
 * order the setup runs them — never the catalogue's order and never a sort.
 * A slug with no record is reported in `missingSlugs` and simply absent from
 * `tools`; the card renders one tile fewer and counts one tool fewer rather
 * than failing. Called with no index (still loading, or the read failed) it
 * returns the setup with an empty tool list, which is the same shape.
 */
export function resolveSetup(setup: AiSetup, index: ToolIndex | undefined): ResolvedSetup {
  if (!index) return { setup, tools: [], missingSlugs: [] }

  const tools = []
  const missingSlugs = []
  for (const slug of setup.toolSlugs) {
    const tool = index.get(slug)
    if (tool) tools.push(tool)
    else missingSlugs.push(slug)
  }

  return { setup, tools, missingSlugs }
}

/**
 * The setups a chip shows.
 *
 * `undefined` is the "All" chip, and All is a CURATED SIX rather than the whole
 * library — the handoff's own filter is `wcat === "All" ? setups.filter(s =>
 * s.star)`. That is a deliberate editorial choice: nineteen cards under a
 * default tab would bury the six the section exists to show, and every one of
 * the nineteen is one chip away.
 *
 * Returns a new array and never sorts, so the order is always the library's
 * declaration order — the same cards in the same places on every render.
 */
export function setupsForCategory(
  setups: readonly AiSetup[],
  category: SetupCategory | undefined,
): AiSetup[] {
  if (!category) return setups.filter((setup) => setup.featured === true)
  return setups.filter((setup) => setup.category === category)
}

/**
 * The setups the /workflows LIBRARY shows.
 *
 * Same chip vocabulary as `setupsForCategory`, one deliberate difference: "All"
 * here means ALL NINETEEN, not the curated six.
 *
 * That is not an inconsistency between the two surfaces, it is the difference
 * between them. The homepage section is a taster with a "Browse all setups"
 * link out of it, so defaulting to nineteen cards would bury the six it exists
 * to show. The Workflows page IS the thing that link points at, and a library
 * whose default view hides two thirds of the library is not a library.
 *
 * Returns a new array and never sorts, so the order is the declaration order on
 * both surfaces and a card does not move when the reader arrives from Home.
 */
export function librarySetupsForCategory(
  setups: readonly AiSetup[],
  category: SetupCategory | undefined,
): AiSetup[] {
  if (!category) return [...setups]
  return setups.filter((setup) => setup.category === category)
}

/**
 * The card's metadata line: "3 tools · 1 workflow · 4 prompts".
 *
 * The tool count is the number of tools that ACTUALLY RESOLVED, not the number
 * the setup names. If the catalogue drops a tool the card says "2 tools" and
 * shows two tiles, because the alternative — printing the editorial number over
 * a stack that visibly holds fewer — is the card lying about itself.
 *
 * While the catalogue is still loading, or after a failed read, the count is
 * omitted entirely rather than shown as 0. The editorial halves stand alone:
 * "1 workflow · 4 prompts" is true whether or not the tiles arrived.
 *
 * Workflow, agent and prompt counts are editorial and appear only where the
 * setup declares them, exactly as the handoff's meta strings do.
 */
export function setupMeta({ setup, tools }: ResolvedSetup, toolsResolved: boolean): string {
  const parts: string[] = []

  if (toolsResolved) parts.push(plural(tools.length, 'tool'))
  if (setup.workflowCount) parts.push(plural(setup.workflowCount, 'workflow'))
  if (setup.agentCount) parts.push(plural(setup.agentCount, 'agent'))
  parts.push(plural(setup.promptCount, 'prompt'))

  return parts.join(' · ')
}

/** The tool-name line under the stack — from the resolved records, never a string. */
export function setupToolNames({ tools }: ResolvedSetup): string {
  return tools.map((tool) => tool.name).join(' · ')
}

/**
 * The sentence "View Setup" hands to the assistant.
 *
 * Same architecture as the design's `letsBuild()` and its React port in
 * components/assistant/BuildSetupCard.tsx: the card composes one plain-English
 * request and sends it into the existing conversation. It does not assemble a
 * plan — the server grounds every tool it recommends against the catalogue, and
 * a plan built in the browser would be a second, ungrounded assistant whose
 * output the next chat message could not refine.
 *
 * Real catalogue names are used rather than the editorial slugs, because they
 * are what the assistant's retrieval matches on.
 */
export function composeSetupRequest({ setup, tools }: ResolvedSetup): string {
  const named = tools.length > 0 ? ` using ${andList(tools.map((tool) => tool.name))}` : ''
  const flow = setup.stages.join(' → ')
  return `Walk me through the "${setup.title}" setup${named} — ${flow}.`
}

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

/** "a, b and c" — the reading order, so the sentence scans as English. */
function andList(values: string[]): string {
  if (values.length <= 1) return values.join('')
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}
