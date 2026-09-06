/*
 * POST /api/assistant/chat
 *
 * The only endpoint that reaches a model. Its whole job is the boundary:
 * validate what came in, hand it to the engine, and translate the engine's error
 * vocabulary into the HTTP contract in ASSISTANT_ARCHITECTURE_PLAN.md §13.
 *
 * No retrieval, no prompt, no grounding, no knowledge of a provider. The handler
 * receives an AssistantEngine and could not name a model if it wanted to.
 *
 * ── Where the LLM error vocabulary becomes HTTP ───────────────────────────────
 *
 * src/llm/ throws LLMError, deliberately, because that directory moves to
 * shared/llm in Phase H and will be imported by the News Agent, which has no
 * HTTP layer at all (see the header of llm/errors.ts). The mapping onto statuses
 * therefore belongs HERE, at the route boundary, and nowhere deeper:
 *
 *   LLM_SCHEMA       → 422 ASSISTANT_UNAVAILABLE   the model answered, wrongly,
 *                                                  three times
 *   LLM_REFUSAL      → 503 PROVIDER_UNAVAILABLE    it declined
 *   LLM_UNAVAILABLE  → 503 PROVIDER_UNAVAILABLE    it errored or timed out
 *   BUDGET_EXCEEDED  → 503 PROVIDER_UNAVAILABLE    this turn's circuit breaker
 *
 * Anything else falls through to the error handler as an INTERNAL, whose message
 * is replaced before it reaches a client.
 *
 * ── Reject the message, truncate the history ──────────────────────────────────
 *
 * §13 rejects a message over 2,000 characters; §11 truncates the transcript
 * instead. That looks inconsistent and is not: silently truncating what the user
 * just typed answers a question they did not ask, while silently dropping the
 * ninth-oldest turn of their transcript costs them nothing they would notice.
 */

import { Router } from 'express'
import { z } from 'zod'
import { ConversationContextSchema, ConversationMessageSchema } from '../../assistant/context.ts'
import type { AssistantEngine } from '../../assistant/engine.ts'
import { ASSISTANT } from '../../config/limits.ts'
import { assistantUnavailable, providerUnavailable } from '../../domain/errors.ts'
import { isLLMError } from '../../llm/errors.ts'
import { parseOrThrow } from '../validate.ts'

/**
 * The request body (§13).
 *
 * `.strict()`, like every schema in this system: a client sending
 * `{"model": "gpt-4"}` is a client trying to steer something it does not own,
 * and answering as though the key had been understood is worse than a 400.
 *
 * `messages` carries no length cap of its own. The 32 KB body limit already
 * bounds it, and §11 says history is enforced by truncation — a cap here would
 * make turn nine of a good conversation fail.
 */
const ChatBodySchema = z
  .object({
    message: z.string().trim().min(1).max(ASSISTANT.maxMessageChars),
    messages: z.array(ConversationMessageSchema).optional(),
    context: ConversationContextSchema.optional(),
  })
  .strict()

export type ChatRequestBody = z.infer<typeof ChatBodySchema>

export interface AssistantRouteOptions {
  engine: AssistantEngine
}

export function createAssistantRouter({ engine }: AssistantRouteOptions): Router {
  const router = Router()

  router.post(ASSISTANT.chatPath, (req, res, next) => {
    void (async () => {
      try {
        const body = parseOrThrow(ChatBodySchema, req.body, 'body')
        res.json(
          await engine.runTurn({
            message: body.message,
            ...(body.messages ? { messages: body.messages } : {}),
            ...(body.context ? { context: body.context } : {}),
          }),
        )
      } catch (error) {
        next(toHttpError(error))
      }
    })()
  })

  return router
}

/**
 * Translates an LLM-layer failure into the API's error vocabulary.
 *
 * Messages are written for the person reading the response, and say nothing
 * about prompts, providers, models or budgets — that detail is in the logs,
 * where it belongs. Anything that is not an LLMError is passed through
 * untouched, so an ApiError keeps its status and an unexpected throw still
 * becomes a generic INTERNAL.
 */
export function toHttpError(error: unknown): unknown {
  if (!isLLMError(error)) return error

  switch (error.code) {
    case 'LLM_SCHEMA':
      return assistantUnavailable(
        'The assistant could not produce a usable answer. Please try again.',
        { cause: 'schema' },
      )
    case 'LLM_REFUSAL':
    case 'LLM_UNAVAILABLE':
    case 'BUDGET_EXCEEDED':
      return providerUnavailable('The assistant is temporarily unavailable. Please try again.')
    default:
      return error
  }
}
