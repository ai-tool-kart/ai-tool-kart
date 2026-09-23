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
 * `workflowSummary` describes the process more than the outcome. §5 says not
 * to paper over that: an authored `steps` array is the fix, not a rewrite here.
 */

import type { Automation, AutomationStep } from './types.ts'

/** The fixed titles, in the order the steps render. */
export const DERIVED_STEP_TITLES = {
  openTool: 'Open the tool',
  usePrompt: 'Use this prompt',
  result: "What you'll get",
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
      body: `Paste this prompt into ${tool.name}.`,
      prompt: automation.samplePrompt,
    },
    {
      title: DERIVED_STEP_TITLES.result,
      body: automation.workflowSummary,
    },
  ]
}
