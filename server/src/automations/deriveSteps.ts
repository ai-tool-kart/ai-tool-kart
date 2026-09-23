/*
 * The three default steps — SPEC-automations.md §5.
 *
 * Used as `automation.steps ?? deriveSteps(automation)`: the CALLER chooses
 * between authored and derived steps, so this function never looks at
 * `automation.steps`. Derivation happens at render time and is never stored,
 * which is why nothing here writes back to the record.
 *
 * Pure: no IO, no catalogue access, nothing async. Same input, same steps.
 *
 * ── The tool's url ────────────────────────────────────────────────────────────
 *
 * §5 says step 1 links `tools[0].url`, but `AutomationStep` (§3) has no url
 * field. Rather than widen the authored-step shape for a derived one, step 1
 * names the tool in `toolName`, and the renderer resolves the link against
 * `automation.tools` — which every detail response already carries.
 *
 * ── Step 3 ────────────────────────────────────────────────────────────────────
 *
 * Titled "How it works", not "What you'll get": across niches
 * `workflowSummary` describes the procedure, not the outcome, and often opens
 * with setup that comes BEFORE the prompt ("Upload your lecture slides…",
 * "Record or connect your call platform…"). An outcome label promised
 * something the text does not say. An authored `steps` array remains the real
 * fix (§5); this label just stops the derived one from misleading.
 */

import type { Automation, AutomationStep } from './types.ts'

/** The fixed titles, in the order the steps render. */
export const DERIVED_STEP_TITLES = {
  openTool: 'Open the tool',
  usePrompt: 'Use this prompt',
  howItWorks: 'How it works',
} as const

export function deriveSteps(automation: Automation): AutomationStep[] {
  const [tool] = automation.tools
  // AutomationSchema requires at least one tool, so a parsed record always
  // has one. Reaching this is a caller passing unvalidated data.
  if (!tool) {
    throw new Error(`Automation "${automation.id}" has no tools to derive steps from.`)
  }

  return [
    {
      title: DERIVED_STEP_TITLES.openTool,
      body: `Open ${tool.name}.`,
      toolName: tool.name,
      ...(tool.accessNote ? { tip: tool.accessNote } : {}),
    },
    {
      title: DERIVED_STEP_TITLES.usePrompt,
      // No body: any sentence here only repeated the title. Not "paste into
      // {tool}" either — for a call recorder or a CRM there is nowhere to
      // paste, and the sheet does not say where the prompt goes.
      prompt: automation.samplePrompt,
    },
    {
      title: DERIVED_STEP_TITLES.howItWorks,
      body: automation.workflowSummary,
    },
  ]
}
