/*
 * Assistant barrel.
 *
 * The route layer consumes the engine through here and never reaches into
 * grounding, prompts or the schema; container.ts is the only module that
 * constructs one.
 */

export { createAssistantEngine, NO_CANDIDATES_MESSAGE, NO_MODEL } from './engine.ts'
export type {
  AssistantEngine,
  AssistantTurnRequest,
  CreateAssistantEngineOptions,
} from './engine.ts'

export {
  ConversationContextSchema,
  ConversationMessageSchema,
  emptyContext,
  normalizeContext,
  nextContext,
  truncateHistory,
} from './context.ts'
export type { ConversationContextInput } from './context.ts'

export { GROUNDING_FALLBACK_MESSAGE, groundReply } from './ground.ts'
export type { GroundingResult } from './ground.ts'

export {
  ASSISTANT_SCHEMA_NAME,
  AssistantPlanSchema,
  AssistantReplySchema,
  AssistantUnderstoodSchema,
  AssistantWorkflowEntrySchema,
} from './schema.ts'
export type { AssistantReply, AssistantReplyPlan, AssistantWorkflowEntry } from './schema.ts'

export * from './prompts/index.ts'
