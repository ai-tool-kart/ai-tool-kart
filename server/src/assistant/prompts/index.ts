/* The assistant's prompt barrel. The reusable primitives it builds on live in
 * llm/prompts/ and are Phase H's to move; the wording here is the product's. */

export {
  ASSISTANT_TASK,
  assistantSystemPrompt,
  assistantUserPrompt,
  turnGuidance,
} from './assistant.ts'
export type { AssistantPromptInput, TurnGuidance } from './assistant.ts'
