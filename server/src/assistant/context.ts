/*
 * Conversation context — normalise in, updated value out.
 *
 * The server is STATELESS (ASSISTANT_ARCHITECTURE_PLAN.md §11). There is no
 * session, no store and no cleanup job: the client holds the transcript and
 * echoes back a compact context object, the server merges the turn into it, and
 * the updated value goes out with the response.
 *
 * That is why everything here is a pure function over values. The day accounts
 * arrive, "saved conversations" is a table whose payload column holds exactly
 * this object — nothing in this file has to change for that to be true.
 *
 * ── Phase E's share of this file, and what is deliberately missing ────────────
 *
 * Phase F owns refinement: extracting constraints from what the user says,
 * moving a tool into `rejectedToolIds` when they turn it down, narrowing the
 * candidate set on the next turn. None of that is here.
 *
 * What IS here is the minimum the API contract needs: accept a context, make it
 * safe, carry it faithfully, hand back a version with the turn advanced. The
 * distinction matters because carrying a field faithfully is not the same as
 * implementing the feature behind it — a client that already sends
 * `rejectedToolIds` gets them honoured by retrieval today, but nothing in Phase
 * E ever ADDS an id to that list.
 *
 * ── Truncate, never reject ────────────────────────────────────────────────────
 *
 * §11 is explicit: history caps are enforced by truncation so a long
 * conversation degrades instead of erroring. A user twelve turns into a useful
 * conversation must not be told their next message is invalid. The one exception
 * is the CURRENT message, which §13 rejects above 2,000 characters — silently
 * truncating the thing the user just typed would answer a question they did not
 * ask.
 */

import { z } from 'zod'
import { ASSISTANT } from '../config/limits.ts'
import type { ConversationContext, ConversationMessage } from '../domain/types.ts'
import type { AssistantReply } from './schema.ts'

/**
 * The context as it arrives on the wire.
 *
 * Every field is optional — an absent context starts a fresh conversation (§13)
 * — but the object itself is `.strict()`: an unknown key is a client sending
 * something this server does not implement, and answering it as though it had
 * been understood is how a feature comes to "work" without existing.
 */
export const ConversationContextSchema = z
  .object({
    role: z.string().trim().max(ASSISTANT.maxRoleChars).optional(),
    goal: z.string().trim().max(ASSISTANT.maxGoalChars).optional(),
    constraints: z.array(z.string().trim().max(ASSISTANT.maxConstraintChars)).optional(),
    confirmedToolIds: z.array(z.string().trim().max(ASSISTANT.maxToolIdChars)).optional(),
    rejectedToolIds: z.array(z.string().trim().max(ASSISTANT.maxToolIdChars)).optional(),
    turn: z.number().int().min(0).optional(),
  })
  .strict()

export type ConversationContextInput = z.infer<typeof ConversationContextSchema>

/** One transcript entry. Text length is truncated later, never rejected. */
export const ConversationMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string(),
  })
  .strict()

/** Deduplicates, drops empties, and caps the length. Order is preserved. */
function cleanIds(values: readonly string[] | undefined, cap: number): string[] {
  if (!values) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const id = value.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= cap) break
  }
  return out
}

/** An empty context — the shape a first turn starts from. */
export function emptyContext(): ConversationContext {
  return { constraints: [], confirmedToolIds: [], rejectedToolIds: [], turn: 0 }
}

/**
 * Makes an incoming context safe to use.
 *
 * "Safe" means bounded and deduplicated, not trusted. Every value here
 * originated in a client request, so nothing normalised here may be treated as
 * an instruction or placed in a system prompt — see assistant/prompts.
 */
export function normalizeContext(input?: ConversationContextInput | null): ConversationContext {
  if (!input) return emptyContext()

  const context: ConversationContext = {
    constraints: cleanIds(input.constraints, ASSISTANT.maxConstraints),
    confirmedToolIds: cleanIds(input.confirmedToolIds, ASSISTANT.maxContextToolIds),
    rejectedToolIds: cleanIds(input.rejectedToolIds, ASSISTANT.maxContextToolIds),
    turn: Math.min(Math.max(input.turn ?? 0, 0), ASSISTANT.maxConversationTurns),
  }

  const role = input.role?.trim()
  if (role) context.role = role
  const goal = input.goal?.trim()
  if (goal) context.goal = goal

  return context
}

/**
 * Trims the transcript to what the prompt is allowed to carry (§11).
 *
 * Last N turns, each capped in length. The tail is kept rather than the head:
 * the most recent exchange is what the current message refers to.
 */
export function truncateHistory(
  messages: readonly ConversationMessage[] | undefined,
): ConversationMessage[] {
  if (!messages || messages.length === 0) return []
  return messages.slice(-ASSISTANT.maxHistoryTurns).map((entry) => ({
    role: entry.role,
    text: entry.text.slice(0, ASSISTANT.maxHistoryMessageChars),
  }))
}

/**
 * The context to return with this turn's answer.
 *
 * `role`, `goal` and `constraints` are adopted from what the model reports it
 * understood, and otherwise carried forward. That is the whole of Phase E's
 * merge: an understanding the model states IS the interpretation the plan was
 * built on, so echoing it back is what lets the user correct it.
 *
 * Note what is NOT done. A tool appearing in the plan is not moved into
 * `confirmedToolIds` — the user has not confirmed anything by being shown a
 * recommendation, and treating a suggestion as an acceptance would quietly pin
 * the conversation to tools nobody chose. Phase F owns that transition.
 */
export function nextContext(
  previous: ConversationContext,
  reply: Pick<AssistantReply, 'understood'>,
): ConversationContext {
  const context: ConversationContext = {
    constraints:
      reply.understood.constraints.length > 0
        ? cleanIds(reply.understood.constraints, ASSISTANT.maxConstraints)
        : [...previous.constraints],
    confirmedToolIds: [...previous.confirmedToolIds],
    rejectedToolIds: [...previous.rejectedToolIds],
    turn: Math.min(previous.turn + 1, ASSISTANT.maxConversationTurns),
  }

  const role = reply.understood.role?.trim() || previous.role
  if (role) context.role = role
  const goal = reply.understood.goal?.trim() || previous.goal
  if (goal) context.goal = goal

  return context
}
