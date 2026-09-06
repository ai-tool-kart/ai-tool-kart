/*
 * THE AUTHORITATIVE ASSISTANT SCHEMA.
 *
 * ASSISTANT_ARCHITECTURE_PLAN.md §10.1, expressed in Zod and `.strict()`
 * throughout. This is the single definition of what a model is allowed to
 * return; Phase D's stand-in in tests/llm.test.ts imports it from here rather
 * than owning a copy, so the mock provider and the engine can never be validated
 * against two different contracts.
 *
 * ── Why `.strict()` is a security control, not a style preference ─────────────
 *
 * A closed schema is the STRUCTURAL half of the injection defence. The other
 * half — wrapping untrusted text so it never enters the system prompt — lives in
 * llm/prompts/shared.ts. Together they mean injected text can try to change what
 * the model SAYS, but cannot change the SHAPE of what comes back: a response
 * that acquired `{"publishImmediately": true}` fails validation and is rejected
 * rather than quietly acted on.
 *
 * `.strict()` is applied at every level, including inside the plan and inside
 * each workflow entry. A strict outer object with a loose inner one is not a
 * closed schema; it is a closed front door next to an open window.
 *
 * ── What this schema deliberately does NOT do ─────────────────────────────────
 *
 * It does not check that a tool id exists. It cannot: a schema validates shape,
 * and "is this id real" is a question about the catalogue. That check is
 * assistant/ground.ts, and it runs on every id in every field after validation
 * succeeds. Nothing here should ever be mistaken for grounding.
 *
 * Tool ids are also carried as IDS, not as hydrated tool objects: the model is
 * shown compact cards and answers with the ids from them, and hydration happens
 * after grounding. A schema that accepted tool objects would be a schema that
 * let the model describe a tool, which is exactly the thing it must never do.
 */

import { z } from 'zod'
import { ASSISTANT } from '../config/limits.ts'
import { ASSISTANT_INTENTS } from '../domain/types.ts'

/** A catalogue id as the model writes it back. Existence is ground.ts's job. */
const ToolIdSchema = z.string().trim().min(1).max(ASSISTANT.maxToolIdChars)

/**
 * One workflow stage.
 *
 * `toolId` is optional because a stage the catalogue cannot staff is a real
 * outcome — retrieval reports it in `unmetStages` — and a plan that names the
 * step honestly, with no tool, is better than one that invents a tool for it.
 */
export const AssistantWorkflowEntrySchema = z
  .object({
    stage: z.string().trim().min(1).max(ASSISTANT.maxStageChars),
    toolId: ToolIdSchema.optional(),
    /** Why THIS tool at THIS stage. One line; the panel renders it inline. */
    why: z.string().trim().min(1).max(ASSISTANT.maxWhyChars),
  })
  .strict()

/**
 * The six sections of "Your AI Plan", in the design's render order.
 *
 * toolIds → Tools · agents → Agents · workflow → Workflow · prompts → Prompts ·
 * comparison → Comparison · steps → Steps. One field per section, so Phase G
 * needs no translation layer (§10.1's table).
 *
 * The maxima are the plan's. The minima are 1 rather than the plan's 2–3: see
 * the note on ASSISTANT in config/limits.ts — a minimum in a schema is a
 * rejection, and rejecting an honest single-tool plan produces a 422 where a
 * thin plan would have been the right answer.
 */
export const AssistantPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(ASSISTANT.maxTitleChars),
    toolIds: z.array(ToolIdSchema).min(1).max(ASSISTANT.maxPlanTools),
    agents: z.array(z.string().trim().min(1).max(ASSISTANT.maxAgentChars)).max(ASSISTANT.maxAgents),
    workflow: z.array(AssistantWorkflowEntrySchema).min(1).max(ASSISTANT.maxWorkflowStages),
    /** One line, e.g. "4 prompts for hooks and titles". */
    prompts: z.string().trim().min(1).max(ASSISTANT.maxNoteChars),
    /** One line, e.g. "Opus Clip vs Descript on one upload". */
    comparison: z.string().trim().min(1).max(ASSISTANT.maxNoteChars),
    steps: z
      .array(z.string().trim().min(1).max(ASSISTANT.maxStepChars))
      .min(1)
      .max(ASSISTANT.maxSteps),
  })
  .strict()

/**
 * What the assistant understood the user to be asking for.
 *
 * Echoed back so the user can see — and correct — the interpretation the plan
 * was built on. `role` and `goal` are optional because claiming to have
 * understood something the message did not say is worse than admitting it did
 * not: a wrong role silently narrows every subsequent turn.
 */
export const AssistantUnderstoodSchema = z
  .object({
    role: z.string().trim().min(1).max(ASSISTANT.maxRoleChars).optional(),
    goal: z.string().trim().min(1).max(ASSISTANT.maxGoalChars).optional(),
    constraints: z
      .array(z.string().trim().min(1).max(ASSISTANT.maxConstraintChars))
      .max(ASSISTANT.maxConstraints),
  })
  .strict()

/**
 * The model's reply.
 *
 * `plan` is absent for `clarify` and `off_topic` — there is nothing to plan.
 * That relationship is NOT expressed as a Zod refinement, on purpose: a refined
 * schema turns "the model attached a plan to a clarifying answer" into a
 * validation failure and burns a repair attempt, when the correct handling is to
 * drop the plan and keep the answer. ground.ts enforces it structurally instead,
 * where the fix is free.
 */
export const AssistantReplySchema = z
  .object({
    /** The chat bubble. */
    message: z.string().trim().min(1).max(ASSISTANT.maxMessageReplyChars),
    intent: z.enum(ASSISTANT_INTENTS),
    understood: AssistantUnderstoodSchema,
    plan: AssistantPlanSchema.optional(),
    /** Refinement chips offered under the answer. */
    followUps: z
      .array(z.string().trim().min(1).max(ASSISTANT.maxFollowUpChars))
      .max(ASSISTANT.maxFollowUps),
  })
  .strict()

export type AssistantReply = z.infer<typeof AssistantReplySchema>
export type AssistantReplyPlan = z.infer<typeof AssistantPlanSchema>
export type AssistantWorkflowEntry = z.infer<typeof AssistantWorkflowEntrySchema>

/** The name the prompt and every error message call this contract. */
export const ASSISTANT_SCHEMA_NAME = 'AssistantReply'
