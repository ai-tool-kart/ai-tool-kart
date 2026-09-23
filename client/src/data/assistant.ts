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
 * The "Build Your AI Setup" card's own mark.
 *
 * Formerly shared with the plan panel's six-section icon set; the panel no
 * longer has sections, but the setup card still draws this one.
 */
export const WORKFLOW_ICON = 'M5.5 4.5h4v4h-4zM14.5 15.5h4v4h-4zM7.5 8.5v5a2 2 0 0 0 2 2h5'
