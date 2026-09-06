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
import { isRole } from '../catalogue/taxonomy.ts'
import { ASSISTANT, RETRIEVAL } from '../config/limits.ts'
import type {
  AssistantChatResponse,
  AssistantPlan,
  AssistantWorkflowStep,
  ConversationContext,
  ConversationMessage,
  Tool,
  ToolSummary,
} from '../domain/types.ts'
import { toToolSummary } from '../domain/types.ts'
import type { LLMClient } from '../llm/client.ts'
import type { ToolCard } from '../llm/prompts/cards.ts'
import type { QueryContext } from '../retrieval/normalize.ts'
import type { RetrievalService } from '../retrieval/service.ts'
import type { Logger } from '../utils/logger.ts'
import { normalizeContext, nextContext, truncateHistory } from './context.ts'
import {
  GROUNDING_FALLBACK_FOLLOW_UPS,
  GROUNDING_FALLBACK_MESSAGE,
  groundReply,
} from './ground.ts'
import { assistantSystemPrompt, assistantUserPrompt } from './prompts/assistant.ts'
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
      const context = normalizeContext(request.context)
      const history = truncateHistory(request.messages)

      /*
       * Retrieval gets the caller's context as facets, never as free text.
       *
       * `role` is only passed when it matches the taxonomy: QueryContext.role is
       * a closed list, and a free-text role the user typed ("indie hacker") is a
       * scoring signal the normaliser already extracts from the message itself.
       * Rejected ids ARE passed, because §11 says they are excluded from future
       * candidate sets, and honouring that is one line here.
       */
      const queryContext: QueryContext = {}
      if (context.role && isRole(context.role)) queryContext.role = context.role
      if (context.rejectedToolIds.length > 0) {
        queryContext.rejectedToolIds = context.rejectedToolIds
      }

      const retrieved = await retrieval.retrieve({
        query: request.message,
        context: queryContext,
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
        })
        return {
          message: NO_CANDIDATES_MESSAGE,
          intent: 'clarify',
          understood: understoodFrom(context),
          followUps: [...NO_CANDIDATES_FOLLOW_UPS].slice(0, ASSISTANT.maxFollowUps),
          context: { ...context, turn: Math.min(context.turn + 1, ASSISTANT.maxConversationTurns) },
          meta: { model: NO_MODEL, attempts: 0, candidates: 0, droppedToolIds: [] },
        }
      }

      const cards = candidates.map(toToolCard)
      const client = createClient()

      const response = await client.run({
        task: 'assistant',
        system: assistantSystemPrompt(cards),
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
      const wanted = grounded.reply.plan?.toolIds ?? []
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
        const tools = wanted
          .map((id) => hydrated.get(id))
          .filter((tool): tool is ToolSummary => tool !== undefined)

        if (tools.length === 0) {
          // Everything the plan named vanished between retrieval and hydration.
          // Same rule as grounding: degrade, never render an empty plan.
          degraded = true
          intent = 'clarify'
          message = GROUNDING_FALLBACK_MESSAGE
          followUps = [...GROUNDING_FALLBACK_FOLLOW_UPS].slice(0, ASSISTANT.maxFollowUps)
        } else {
          plan = {
            title: reply.plan.title,
            tools,
            agents: [...reply.plan.agents],
            workflow: reply.plan.workflow.map((entry) => toWorkflowStep(entry, hydrated)),
            prompts: reply.plan.prompts,
            comparison: reply.plan.comparison,
            steps: [...reply.plan.steps],
          }
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
        candidates: candidates.length,
        planTools: plan?.tools.length ?? 0,
        attempts: response.attempts,
        model: response.model,
        droppedToolIds,
        degraded,
        ...(grounded.unlistedToolIds.length > 0
          ? { unlistedToolIds: grounded.unlistedToolIds }
          : {}),
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
        context: nextContext(context, reply),
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

function toWorkflowStep(
  entry: { stage: string; toolId?: string; why: string },
  hydrated: Map<string, ToolSummary>,
): AssistantWorkflowStep {
  const tool = entry.toolId ? hydrated.get(entry.toolId) : undefined
  const step: AssistantWorkflowStep = { stage: entry.stage, why: entry.why }
  if (tool) step.tool = tool
  return step
}

/** What we already believed, for a turn that never reached the model. */
function understoodFrom(context: ConversationContext): AssistantChatResponse['understood'] {
  return {
    ...(context.role ? { role: context.role } : {}),
    ...(context.goal ? { goal: context.goal } : {}),
    constraints: [...context.constraints],
  }
}
