/*
 * Copy for the assistant stage, ported from the final design
 * (ai-tool-kart-pre-final-design/project/AI Tool Kart Site.dc.html):
 * the greeting bubble, HERO_SUGGEST, and the six PLAN_ICONS labels.
 *
 * This file holds UI TEXT only. No tool, no category and no role list lives
 * here: the plan's content comes from POST /api/assistant/chat and the setup
 * pickers read their options from GET /api/taxonomy, both against the real
 * catalogue. A hardcoded tool in this file would be a tool the assistant never
 * vouched for.
 */

/**
 * The bubble that is always first in the transcript.
 *
 * DEVIATION, stated: the design's line ends "I'll ask one quick question, then
 * build the plan on the right." The prototype always asked one scripted
 * question; the real engine decides per turn whether it needs to clarify, and
 * usually answers straight away. Promising a question it will not ask is worse
 * than losing four words, so the clause is rewritten. Nothing else changes.
 */
export const ASSISTANT_GREETING =
  'Tell me what you want to get done — say “I need AI tools to launch a SaaS landing page.” ' +
  "I'll put the right tools together and build the plan on the right."

/** The starter chips above the composer. Design: HERO_SUGGEST. */
export const ASSISTANT_SUGGESTIONS: string[] = [
  'Launch a SaaS landing page',
  'Edit videos faster',
  'Automate client follow-ups',
]

/**
 * The six sections of "Your AI Plan", in the design's render order.
 *
 * `key` is also the field name on the server's plan object for four of the six
 * (agents, workflow, prompts, steps); `tools` and `comparison` differ only in
 * that the API calls them `tools` and `comparison` too — so the mapping is
 * one-to-one and the panel needs no lookup table. The order is the design's and
 * must not be sorted.
 */
/** Also the "Build Your AI Setup" card's own mark — the same drawing. */
export const WORKFLOW_ICON = 'M5.5 4.5h4v4h-4zM14.5 15.5h4v4h-4zM7.5 8.5v5a2 2 0 0 0 2 2h5'

export type PlanSectionKey =
  | 'tools'
  | 'agents'
  | 'workflow'
  | 'prompts'
  | 'comparison'
  | 'steps'

export interface PlanSectionMeta {
  key: PlanSectionKey
  /** The uppercase micro-label on the section card. */
  label: string
  /** Single-path icon data, traced from the design's PLAN_ICONS. */
  icon: string
}

export const PLAN_SECTIONS: PlanSectionMeta[] = [
  { key: 'tools', label: 'Tools', icon: 'M4.5 5.5h6v6h-6zM13.5 5.5h6v6h-6zM4.5 14h6v6h-6zM13.5 14h6v6h-6z' },
  { key: 'agents', label: 'Agents', icon: 'M4.5 8h15v10.5h-15zM12 4v4M9 12.4v2M15 12.4v2' },
  { key: 'workflow', label: 'Workflow', icon: WORKFLOW_ICON },
  { key: 'prompts', label: 'Prompts', icon: 'M4.5 5.5h15v10h-9l-4 3.5v-3.5z' },
  { key: 'comparison', label: 'Comparison', icon: 'M12 4.5v15M5 9h14M7.5 9 5 15.5h5zM16.5 9 14 15.5h5z' },
  { key: 'steps', label: 'Steps', icon: 'M4.5 6.5h3v3h-3zM4.5 15h3v3h-3zM10.5 8h9M10.5 16.5h9' },
]
