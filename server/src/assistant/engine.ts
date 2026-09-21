/*
 * The assistant engine — the orchestrator.
 *
 *   validated request
 *     → merge context
 *     → deterministic retrieval                       (no model involved)
 *     → no useful candidates? clarify, WITHOUT calling the model
 *     → trusted candidate cards + untrusted user turn
 *     → LLM client: schema validation and bounded repair
 *     → grounding gate: every id checked against the candidate set
 *     → hydration through the catalogue repository
 *     → AssistantChatResponse
 *
 * ── What this module is not allowed to know ───────────────────────────────────
 *
 * It receives a RetrievalService, a ToolCatalogueRepository, a function that
 * makes an LLM client, and a logger. It does not construct any of them, does not
 * know the catalogue is a JSON file, and does not name a provider. Swapping
 * either implementation is a line in container.ts — the boundary
 * ASSISTANT_ARCHITECTURE_PLAN.md §6.1 and §6.4 exist to protect, and one
 * tests/boundary.test.ts enforces mechanically.
 *
 * ── One budget per turn ───────────────────────────────────────────────────────
 *
 * `createClient` is a FACTORY, called once per turn, and that is the whole
 * reason it is a factory rather than a client. A budget is mutable accounting:
 * a single shared one means the first pathological conversation of the process
 * consumes every later request's headroom, and the symptom is unrelated users
 * getting 503s. The provider behind the client is stateless and stays shared.
 *
 * ── The two paths that never reach the model ──────────────────────────────────
 *
 * An empty candidate set (§9) and a plan that grounding emptied (§8 of the Phase
 * E brief) both answer with a clarifying question. Neither is a failure to
 * report: an assistant that says "tell me more" is behaving correctly, and
 * turning either into an error would trade a useful answer for a red toast.
 */

import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import { STAGE_ACTIONS, type WorkflowStage } from '../catalogue/taxonomy.ts'
import { ASSISTANT, RETRIEVAL } from '../config/limits.ts'
import type {
  AssistantChatResponse,
  AssistantPlan,
  AssistantPlanStep,
  ConversationContext,
  ConversationMessage,
  Tool,
  ToolSummary,
} from '../domain/types.ts'
import { toToolSummary } from '../domain/types.ts'
import type { LLMClient } from '../llm/client.ts'
import type { ToolCard } from '../llm/prompts/cards.ts'
import type { RetrievalService } from '../retrieval/service.ts'
import type { Logger } from '../utils/logger.ts'
import { advanceContext, normalizeContext, truncateHistory } from './context.ts'
import {
  GROUNDING_FALLBACK_FOLLOW_UPS,
  GROUNDING_FALLBACK_MESSAGE,
  groundReply,
} from './ground.ts'
import { assistantSystemPrompt, assistantUserPrompt } from './prompts/assistant.ts'
import { refineContext } from './refine.ts'
import { ASSISTANT_SCHEMA_NAME, AssistantReplySchema } from './schema.ts'
import type { ConversationContextInput } from './context.ts'

/** What the model is told when retrieval found nothing to offer it. */
export const NO_CANDIDATES_MESSAGE =
  'I do not have enough to go on yet. Tell me what you are working on and which part you ' +
  'want to speed up, and I will put a set of tools together for it.'

export const NO_CANDIDATES_FOLLOW_UPS = [
  'Tell me your role',
  'Describe the task',
  'Set a budget',
]

/** Reported as the model when no model was called. Never a real model id. */
export const NO_MODEL = 'none'

export interface AssistantTurnRequest {
  /** The current message, as typed. Validated for length at the HTTP boundary. */
  message: string
  /** Prior turns the client is holding. Truncated here, never rejected. */
  messages?: ConversationMessage[]
  /** The context returned with the previous turn, if any. */
  context?: ConversationContextInput | null
}

export interface AssistantEngine {
  runTurn(request: AssistantTurnRequest): Promise<AssistantChatResponse>
}

export interface CreateAssistantEngineOptions {
  retrieval: RetrievalService
  /** Used for hydration only, through the port. */
  catalogue: ToolCatalogueRepository
  /**
   * Builds the client for ONE turn, with its own budget.
   *
   * A factory rather than a client, so mutable spend accounting cannot leak
   * between requests. See the note at the top of this file.
   */
  createClient: () => LLMClient
  logger: Logger
}

export function createAssistantEngine({
  retrieval,
  catalogue,
  createClient,
  logger,
}: CreateAssistantEngineOptions): AssistantEngine {
  return {
    async runTurn(request) {
      const log = logger.child({ step: 'assistant' })
      const previous = normalizeContext(request.context)
      const history = truncateHistory(request.messages)

      /*
       * The turn is understood BEFORE anything is retrieved.
       *
       * That order is the whole of Phase F. Refinement reads the user's own
       * words — a rejected tool, a budget, a role, the subject they are still
       * working on — and produces the directives retrieval runs with. Doing it
       * after the model answered would make the context a record of the
       * conversation rather than a participant in it.
       */
      const refined = await refineContext({
        previous,
        message: request.message,
        catalogue,
        logger,
      })
      const context = refined.context

      /*
       * Stated constraints may FILTER; inferred signals only RANK.
       *
       * That is Phase C's rule (retrieval/service.ts) and Phase F is where it
       * starts earning its keep. A budget the user stated and a tool they ruled
       * out are hard: the answer must not contain them, whatever they score. A
       * category the server merely inferred is passed as context, where it lifts
       * the right tools without deleting the audio tool the video workflow needs.
       */
      const retrieved = await retrieval.retrieve({
        query: refined.retrieval.query,
        context: {
          ...(refined.retrieval.role ? { role: refined.retrieval.role } : {}),
          ...(refined.retrieval.categories.length > 0
            ? { categories: refined.retrieval.categories }
            : {}),
          ...(refined.retrieval.rejectedToolIds.length > 0
            ? { rejectedToolIds: refined.retrieval.rejectedToolIds }
            : {}),
          ...(refined.retrieval.confirmedToolIds.length > 0
            ? { confirmedToolIds: refined.retrieval.confirmedToolIds }
            : {}),
        },
        ...(refined.retrieval.pricingTiers.length > 0
          ? { filters: { pricingTiers: refined.retrieval.pricingTiers } }
          : {}),
        limit: RETRIEVAL.defaultCandidates,
      })

      const candidates = retrieved.candidates.map((entry) => entry.tool)

      // §9 — an empty candidate set never reaches the model. There is nothing to
      // build a plan from, so asking is the only honest answer, and spending a
      // call to be told so would be spending it to invite an invention.
      if (candidates.length === 0) {
        log.info('No candidates; answering without the model', {
          terms: retrieved.interpretation.terms.length,
          emptyQuery: retrieved.interpretation.empty,
          pricingFiltered: refined.retrieval.pricingTiers.length > 0,
          excluded: refined.retrieval.rejectedToolIds.length,
        })
        return {
          message: NO_CANDIDATES_MESSAGE,
          intent: 'clarify',
          understood: understoodFrom(context),
          followUps: [...NO_CANDIDATES_FOLLOW_UPS].slice(0, ASSISTANT.maxFollowUps),
          // The refinement still counts: the user's constraints were understood
          // even though nothing could be recommended under them, and losing them
          // here would make the next turn re-litigate what they already said.
          context: { ...context, turn: Math.min(context.turn + 1, ASSISTANT.maxConversationTurns) },
          meta: { model: NO_MODEL, attempts: 0, candidates: 0, droppedToolIds: [] },
        }
      }

      const cards = candidates.map(toToolCard)
      const client = createClient()

      const response = await client.run({
        task: 'assistant',
        system: assistantSystemPrompt(cards, {
          breadth: refined.breadth,
          turn: context.turn,
          pricingFiltered: refined.retrieval.pricingTiers.length > 0,
          excludedCount: refined.retrieval.rejectedToolIds.length,
        }),
        user: assistantUserPrompt({ message: request.message, history, context }),
        schema: AssistantReplySchema,
        schemaName: ASSISTANT_SCHEMA_NAME,
      })

      const grounded = groundReply(
        response.data,
        candidates.map((tool) => tool.id),
      )

      /*
       * Hydration reads through the repository rather than reusing the candidate
       * records already in hand.
       *
       * It costs one call and buys a real property: the ids that reach the
       * client are ids the catalogue confirmed at the moment of answering. A
       * record withdrawn between retrieval and hydration disappears from the
       * plan instead of being served from a stale copy.
       */
      const wanted = grounded.reply.plan?.steps.map((step) => step.toolId) ?? []
      const hydrated = wanted.length > 0 ? await hydrate(catalogue, wanted) : new Map()
      const missing = wanted.filter((id) => !hydrated.has(id))
      const droppedToolIds = [...grounded.droppedToolIds, ...missing]

      const reply = grounded.reply
      let plan: AssistantPlan | undefined
      let intent = reply.intent
      let message = reply.message
      let followUps = reply.followUps
      let degraded = grounded.degraded

      if (reply.plan) {
        const steps = reply.plan.steps
          .map((step): AssistantPlanStep | undefined => {
            const tool = hydrated.get(step.toolId)
            if (!tool) return undefined
            return { action: STAGE_ACTIONS[step.stage as WorkflowStage], tool }
          })
          .filter((step): step is AssistantPlanStep => step !== undefined)

        if (steps.length === 0) {
          // Everything the plan named vanished between retrieval and hydration.
          // Same rule as grounding: degrade, never render an empty plan.
          degraded = true
          intent = 'clarify'
          message = GROUNDING_FALLBACK_MESSAGE
          followUps = [...GROUNDING_FALLBACK_FOLLOW_UPS].slice(0, ASSISTANT.maxFollowUps)
        } else {
          plan = { goal: request.message.trim(), steps }
        }
      }

      /*
       * The one metric §10.2 calls out. It must be logged on every turn, and it
       * should be empty: a non-empty value is a prompt bug or a model
       * regression, and nothing else in the system will tell you about it.
       *
       * Ids only. The user's message and the model's prose never reach a log
       * line from here.
       */
      log.info('Assistant turn complete', {
        intent,
        turn: context.turn,
        breadth: refined.breadth,
        constraints: context.constraints,
        excluded: refined.retrieval.rejectedToolIds.length,
        confirmed: refined.retrieval.confirmedToolIds.length,
        candidates: candidates.length,
        planSteps: plan?.steps.length ?? 0,
        attempts: response.attempts,
        model: response.model,
        droppedToolIds,
        degraded,
      })

      const result: AssistantChatResponse = {
        message,
        intent,
        understood: {
          ...(reply.understood.role ? { role: reply.understood.role } : {}),
          ...(reply.understood.goal ? { goal: reply.understood.goal } : {}),
          constraints: [...reply.understood.constraints],
        },
        followUps: [...followUps],
        context: advanceContext(context, reply),
        meta: {
          model: response.model,
          attempts: response.attempts,
          candidates: candidates.length,
          droppedToolIds,
        },
      }
      if (plan) result.plan = plan
      return result
    },
  }
}

/** The compact projection the model is shown. Never the whole record. */
function toToolCard(tool: Tool): ToolCard {
  const summary = toToolSummary(tool)
  return {
    id: summary.id,
    name: summary.name,
    cat: summary.cat,
    pricingTier: summary.pricingTier,
    stages: summary.stages,
    tagline: summary.tagline,
  }
}

/**
 * Resolves grounded ids to summaries, in one repository call.
 *
 * A map rather than a list because the workflow needs the same records the tool
 * list does, and looking each one up again would turn a five-stage plan into
 * five more lookups for data already in memory.
 *
 * Draft records are dropped here as well as by retrieval: a tool can be
 * unpublished between the two calls, and an unpublished tool is not
 * recommendable however it got into the plan.
 */
async function hydrate(
  catalogue: ToolCatalogueRepository,
  ids: readonly string[],
): Promise<Map<string, ToolSummary>> {
  const tools = await catalogue.findManyByIds([...ids])
  const map = new Map<string, ToolSummary>()
  for (const tool of tools) {
    if (tool.status !== 'active') continue
    map.set(tool.id, toToolSummary(tool))
  }
  return map
}

/** What we already believed, for a turn that never reached the model. */
function understoodFrom(context: ConversationContext): AssistantChatResponse['understood'] {
  return {
    ...(context.role ? { role: context.role } : {}),
    ...(context.goal ? { goal: context.goal } : {}),
    constraints: [...context.constraints],
  }
}
