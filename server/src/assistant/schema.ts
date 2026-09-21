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
 * each step. A strict outer object with a loose inner one is not a closed
 * schema; it is a closed front door next to an open window.
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
import { WORKFLOW_STAGES } from '../catalogue/taxonomy.ts'
import { ASSISTANT_INTENTS } from '../domain/types.ts'

/** A catalogue id as the model writes it back. Existence is ground.ts's job. */
const ToolIdSchema = z.string().trim().min(1).max(ASSISTANT.maxToolIdChars)

/**
 * One step of the plan.
 *
 * A step is a stage from the closed vocabulary and the one tool that does it —
 * nothing else. The plain-language action shown to the reader, the tool's own
 * tagline, and its free/paid label are never written by the model: they are
 * read off the catalogue during hydration (assistant/engine.ts), because the
 * reader is better served by our own words about a real tool than by the
 * model's paraphrase of them.
 *
 * `toolId` is required, not optional. §9 already guarantees every stage a plan
 * names has at least two real candidates behind it, so a step this assistant
 * offers is a step it can staff — an unstaffed stage is not a plan the model
 * should be describing to a non-technical reader at all.
 */
export const AssistantStepSchema = z
  .object({
    stage: z.enum(WORKFLOW_STAGES),
    toolId: ToolIdSchema,
  })
  .strict()

/**
 * The plan, as a short flat list of steps a non-technical reader can act on.
 *
 * At most `maxPlanSteps`. No minimum in the schema — see the note on ASSISTANT
 * in config/limits.ts — but a real plan is never zero steps in practice,
 * because §9 never lets an empty candidate set reach the model.
 *
 * The two dedup rules are enforced here rather than left to the model's good
 * behaviour, because both are structural properties a reader can immediately
 * see violated: the same tool doing two jobs, or two steps that are really one
 * step twice.
 */
export const AssistantPlanSchema = z
  .object({
    steps: z.array(AssistantStepSchema).max(ASSISTANT.maxPlanSteps),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const toolSeen = new Set<string>()
    const stageSeen = new Set<string>()
    plan.steps.forEach((step, index) => {
      if (toolSeen.has(step.toolId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A tool cannot appear in two steps of the same plan.',
          path: ['steps', index, 'toolId'],
        })
      }
      toolSeen.add(step.toolId)

      if (stageSeen.has(step.stage)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A stage cannot appear in two steps of the same plan.',
          path: ['steps', index, 'stage'],
        })
      }
      stageSeen.add(step.stage)
    })
  })

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
export type AssistantStep = z.infer<typeof AssistantStepSchema>

/** The name the prompt and every error message call this contract. */
export const ASSISTANT_SCHEMA_NAME = 'AssistantReply'
