/*
 * THE ANTI-HALLUCINATION GATE.
 *
 * The load-bearing principle of this whole system (ASSISTANT_ARCHITECTURE_PLAN.md
 * §7): the model never invents a tool. It selects and arranges from a set the
 * server retrieved deterministically, and the server verifies every selection
 * against that set before the response leaves the process.
 *
 * This module is the verification. Every tool id in every field of a model
 * reply is checked against the candidate set retrieval produced for THIS turn —
 * not against the catalogue at large, which would still let the model reach past
 * what it was shown. An id that is not in the candidate set is DROPPED, counted
 * in `droppedToolIds`, and never hydrated, never logged as content, never
 * rendered.
 *
 * ── Why the candidate set and not the catalogue ───────────────────────────────
 *
 * Checking against the catalogue would catch an invented product name and miss
 * the more likely failure: a model that pattern-matched a real tool it happens
 * to know about from training and slipped it into a plan it was never offered.
 * That tool exists, so a catalogue check passes it — and the recommendation is
 * then no longer traceable to anything the server decided. The candidate set is
 * the boundary the trust argument actually rests on.
 *
 * ── The fallback is the point ─────────────────────────────────────────────────
 *
 * If grounding empties a recommendation, the answer is NOT an empty plan. An
 * empty six-section panel reads as a product bug and tells the user nothing. The
 * reply degrades to a clarifying question instead: honest, actionable, and
 * structurally incapable of showing a tool that does not exist.
 *
 * Everything here is a pure function over values. No repository, no logger, no
 * IO — which is what makes "a forged id cannot reach the response" a property a
 * test can prove exhaustively rather than sample.
 */

import { ASSISTANT } from '../config/limits.ts'
import type { AssistantReply, AssistantWorkflowEntry } from './schema.ts'

/**
 * What the user is told when grounding removed everything.
 *
 * Deliberately does not mention tools, ids or filtering: the failure is ours,
 * and describing our internals to a user who asked about video editing helps
 * nobody. It asks the question that actually unblocks the next turn.
 */
export const GROUNDING_FALLBACK_MESSAGE =
  'I could not put together a reliable set of tools for that yet. Tell me a bit more ' +
  'about the work — what you are making, and which part you want help with — and I will ' +
  'build a plan around it.'

export const GROUNDING_FALLBACK_FOLLOW_UPS = [
  'Tell me your role',
  'Describe the task',
  'Set a budget',
]

export interface GroundingResult {
  /** The reply with every unverifiable id removed. Safe to hydrate. */
  reply: AssistantReply
  /** Ids the model named that the candidate set did not contain. */
  droppedToolIds: string[]
  /** True when a plan was removed entirely and the reply became a clarification. */
  degraded: boolean
  /**
   * Real candidate ids a workflow entry referenced that could not be added to
   * the plan's tool list because it was already full. Logged, never returned to
   * the client: these are not hallucinations, so counting them in
   * `droppedToolIds` would corrupt the one metric that matters.
   */
  unlistedToolIds: string[]
}

/**
 * Verifies a reply against the candidate set.
 *
 * The rules, in order:
 *
 *   1. A plan is only meaningful for an intent that recommends something. For
 *      `clarify` and `off_topic` the plan is dropped, per §10.1 — enforced here
 *      rather than as a Zod refinement so it costs a field instead of a retry.
 *   2. `plan.toolIds` keeps only ids present in the candidate set, deduplicated,
 *      first occurrence wins. Order is otherwise preserved: it is the model's
 *      ranking, and re-sorting it would discard the arrangement we asked for.
 *   3. A workflow `toolId` must be a candidate AND belong to the plan's tool
 *      set. A real candidate the plan forgot to list is ADDED to the list (up to
 *      the cap) rather than discarded — it is a tool retrieval offered, and the
 *      Tools section is meant to be the plan's tools.
 *   4. A workflow entry whose tool was dropped keeps its stage and loses its
 *      tool. The schema allows that, and a named step with no tool is more
 *      honest than a step deleted to hide a failure.
 *   5. If nothing survives, the reply degrades to a clarification.
 */
export function groundReply(
  reply: AssistantReply,
  candidateIds: Iterable<string>,
): GroundingResult {
  const allowed = new Set(candidateIds)
  const dropped: string[] = []
  const unlisted: string[] = []

  /** Records a rejection once. A model repeating a forged id is one mistake. */
  const drop = (id: string): void => {
    if (!dropped.includes(id)) dropped.push(id)
  }

  const plan = reply.plan

  // Rule 1 — an intent that is not making a recommendation carries no plan.
  if (!plan || reply.intent === 'clarify' || reply.intent === 'off_topic') {
    if (plan) {
      // Ids inside a plan attached to a clarifying answer are still checked, so
      // a forged one is still counted rather than silently discarded with it.
      for (const id of plan.toolIds) if (!allowed.has(id)) drop(id)
      for (const entry of plan.workflow) {
        if (entry.toolId && !allowed.has(entry.toolId)) drop(entry.toolId)
      }
    }
    const { plan: _removed, ...rest } = reply
    return {
      reply: normaliseIntent({ ...rest }),
      droppedToolIds: dropped,
      degraded: false,
      unlistedToolIds: [],
    }
  }

  // Rule 2 — the plan's own tool list.
  const toolIds: string[] = []
  for (const id of plan.toolIds) {
    if (!allowed.has(id)) {
      drop(id)
      continue
    }
    if (!toolIds.includes(id)) toolIds.push(id)
  }

  // Rule 3 and 4 — workflow references.
  const workflow: AssistantWorkflowEntry[] = plan.workflow.map((entry) => {
    if (!entry.toolId) return { stage: entry.stage, why: entry.why }

    if (!allowed.has(entry.toolId)) {
      drop(entry.toolId)
      return { stage: entry.stage, why: entry.why }
    }

    if (!toolIds.includes(entry.toolId)) {
      if (toolIds.length < ASSISTANT.maxPlanTools) {
        toolIds.push(entry.toolId)
      } else {
        if (!unlisted.includes(entry.toolId)) unlisted.push(entry.toolId)
        return { stage: entry.stage, why: entry.why }
      }
    }

    return { stage: entry.stage, toolId: entry.toolId, why: entry.why }
  })

  // Rule 5 — nothing survived, so there is no plan to show.
  if (toolIds.length === 0) {
    return {
      reply: clarifyFallback(reply),
      droppedToolIds: dropped,
      degraded: true,
      unlistedToolIds: unlisted,
    }
  }

  return {
    reply: {
      ...reply,
      plan: { ...plan, toolIds, workflow },
    },
    droppedToolIds: dropped,
    degraded: false,
    unlistedToolIds: unlisted,
  }
}

/**
 * Replaces a reply whose plan did not survive.
 *
 * The model's own message is discarded along with the plan. It cannot be kept:
 * it was written to introduce a set of tools that is no longer there, so it
 * would describe a stack the user cannot see. `understood` survives, because the
 * interpretation of the request is still the best thing we have to offer back.
 */
function clarifyFallback(reply: AssistantReply): AssistantReply {
  return {
    message: GROUNDING_FALLBACK_MESSAGE,
    intent: 'clarify',
    understood: reply.understood,
    followUps: [...GROUNDING_FALLBACK_FOLLOW_UPS].slice(0, ASSISTANT.maxFollowUps),
  }
}

/**
 * A recommendation with no plan is not a recommendation.
 *
 * The schema permits it — `plan` is optional at every intent — so a model that
 * says `intent: 'recommend'` and attaches nothing would otherwise reach the
 * client as a recommendation the UI has nothing to render for.
 */
function normaliseIntent(reply: AssistantReply): AssistantReply {
  if (reply.plan || (reply.intent !== 'recommend' && reply.intent !== 'refine')) return reply
  return { ...reply, intent: 'clarify' }
}
