import { apiRequest } from '@/services/http'
import type { AssistantChatRequest, AssistantChatResponse } from '@/types/assistant'

/*
 * The assistant transport. One function, one endpoint.
 *
 * Everything the assistant does — retrieval, prompting, grounding every tool id
 * against the catalogue, multi-turn refinement — happens on the server. This
 * module's entire job is to post a turn and hand back what came out. It holds no
 * state, applies no defaults to the reply and knows nothing about panels; that
 * is why hooks/useAssistant.ts can own the conversation without any of this
 * leaking into a component.
 *
 * Adding "helpful" client-side logic here (a local plan fallback, a synthesised
 * follow-up, a guessed tool) would put a second, ungrounded assistant in the
 * browser bundle. There is exactly one assistant, and it is behind this call.
 */

const CHAT_PATH = '/assistant/chat'

/** The server rejects a longer message with a 400, so stop it here instead. */
export const MAX_MESSAGE_CHARS = 2_000

/**
 * Runs one conversational turn.
 *
 * `messages` is the prior transcript and `context` the state the previous
 * response returned — both are the server's, carried by the client and posted
 * back unchanged. Pass the `signal` of a controller you abort on unmount.
 */
export async function sendAssistantMessage(
  request: AssistantChatRequest,
  signal?: AbortSignal,
): Promise<AssistantChatResponse> {
  const message = request.message.trim()

  const body: AssistantChatRequest = { message }
  // Omitted rather than sent empty: the request schema is `.strict()` and an
  // empty history is not the same statement as no history.
  if (request.messages && request.messages.length > 0) body.messages = request.messages
  if (request.context) body.context = request.context
  if (request.kind) body.kind = request.kind

  return apiRequest<AssistantChatResponse>(CHAT_PATH, { body, signal })
}
