/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Prompt primitives barrel.
 *
 * Phase D provides the reusable LLM-level scaffolding only. The assistant's own
 * system prompt is Phase E's, and belongs in server/src/assistant/prompts/.
 */

export {
  HOUSE_RULES,
  UNTRUSTED_CONTENT_RULES,
  UNTRUSTED_DELIMITERS,
  jsonOutputInstruction,
  repairInstruction,
  wrapUntrusted,
} from './shared.ts'

export { formatToolCard, formatToolCards, parseToolCards } from './cards.ts'
export type { ToolCard } from './cards.ts'
