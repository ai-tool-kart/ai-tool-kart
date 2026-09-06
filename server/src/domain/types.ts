/*
 * Domain types.
 *
 * The shapes every layer above the repository speaks in. Nothing here knows
 * where a tool is stored, and nothing here is a wire shape — http/routes owns
 * the API representation, and the JSON adapter owns the on-disk representation.
 *
 * The vocabulary types (ToolCategoryName, PricingTier, WorkflowStage, RoleName,
 * SortOption) are re-exported from catalogue/taxonomy.ts, which is the single
 * source of truth for every closed list (ASSISTANT_ARCHITECTURE_PLAN.md §5.3).
 * That import direction is deliberate: vocabulary is configuration, not storage,
 * so it does not cross the boundary §6.1 protects.
 */

import type {
  PricingModel,
  PricingTier,
  RoleName,
  SortOption,
  Taxonomy,
  ToolCategoryName,
  ToolStatus,
  WorkflowStage,
} from '../catalogue/taxonomy.ts'

export type {
  PricingModel,
  PricingTier,
  RoleName,
  SortOption,
  Taxonomy,
  ToolCategoryName,
  ToolStatus,
  WorkflowStage,
}

/**
 * A catalogue record.
 *
 * The first block is the display contract, kept field-for-field identical to
 * client/src/types/tool.ts so Phase G can retire client/src/data/tools.ts
 * without touching a component (§5.2). The second block is what recommendation
 * actually needs and the frontend does not have yet.
 *
 * Several display fields carry conservative values in the seed catalogue rather
 * than invented precision — see NOT_RECORDED and PROMINENCE in taxonomy.ts.
 */
export interface Tool {
  /* ── Display contract, mirrors client/src/types/tool.ts ─────────────────── */
  id: string
  name: string
  /** Two-character monogram shown in the card avatar. */
  mono: string
  cat: ToolCategoryName
  /** Display pricing chip. Must agree with `pricingTier`; the schema enforces it. */
  model: PricingModel
  tagline: string
  /** 1–5, or 0 meaning "no ratings collected yet". */
  rating: number
  reviews: number
  /** Display string. The seed derives it from `pricingTier`; it is not an amount. */
  price: string
  /** Growth badge, e.g. "+142%". Empty string means none. */
  trend: string
  /** Editorial badge. Empty string means none — never null or undefined. */
  badge: string
  tags: string[]
  /** Editorial prominence score, 0–100. See PROMINENCE in taxonomy.ts. */
  pop: number
  api: string
  ctx: string
  team: string
  trial: string
  integr: string

  /* ── Recommendation contract ────────────────────────────────────────────── */
  /** Stable URL key for the tool detail page. */
  slug: string
  /** The tool's own website, so the assistant can link out. */
  url: string
  /** Two or three sentences. This is what retrieval and later the LLM reason over. */
  summary: string
  roles: RoleName[]
  useCases: string[]
  stages: WorkflowStage[]
  pricingTier: PricingTier
  status: ToolStatus
  verified: boolean
}

/**
 * The projection of a catalogue record that leaves this process.
 *
 * Two consumers, one shape, on purpose:
 *
 *   THE MODEL   retrieval serialises candidates from it (llm/prompts/cards.ts),
 *               roughly forty tokens per record.
 *   THE CLIENT  the assistant's hydrated plan is built from it
 *               (ASSISTANT_ARCHITECTURE_PLAN.md §10.2).
 *
 * Phase C declared the first form; Phase E needs the display fields §10.2 lists
 * — mono, price, rating, url — because "Your AI Plan" renders tool chips from
 * exactly this object. Keeping ONE type rather than two nearly-identical ones
 * means a tool the model was shown and a tool the client renders can never
 * describe different records.
 *
 * `stages` is carried in addition to §10.2's list: it is what the candidate card
 * format serialises, and it is what lets the workflow section be rendered
 * without a second lookup. It is not sensitive, and it is not the whole record —
 * the editorial fields (status, reviews, trend, badge, integrations) stay behind.
 */
export interface ToolSummary {
  id: string
  slug: string
  name: string
  /** Two-character monogram shown in the card avatar. */
  mono: string
  cat: ToolCategoryName
  tagline: string
  pricingTier: PricingTier
  /** Display string, not an amount. */
  price: string
  /** 1–5, or 0 meaning "no ratings collected yet". */
  rating: number
  url: string
  stages: WorkflowStage[]
}

export function toToolSummary(tool: Tool): ToolSummary {
  return {
    id: tool.id,
    slug: tool.slug,
    name: tool.name,
    mono: tool.mono,
    cat: tool.cat,
    tagline: tool.tagline,
    pricingTier: tool.pricingTier,
    price: tool.price,
    rating: tool.rating,
    url: tool.url,
    stages: [...tool.stages],
  }
}

/* ── The assistant (Phase E) ───────────────────────────────────────────────── */

/**
 * What the assistant decided the turn was.
 *
 * Declared here rather than in assistant/schema.ts so the closed list has one
 * definition that both the Zod schema and the hydrated response type read from,
 * and so domain/ stays a leaf: assistant/ imports domain, never the reverse.
 *
 * `off_topic` exists so a request outside the product's scope has a structured
 * answer instead of becoming a general-purpose chatbot reply
 * (ASSISTANT_ARCHITECTURE_PLAN.md §10.1).
 */
export const ASSISTANT_INTENTS = [
  'clarify',
  'recommend',
  'refine',
  'explain',
  'off_topic',
] as const

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number]

/**
 * The conversation, compressed to what the next turn actually needs.
 *
 * The server is stateless (§11): the client holds the transcript and echoes this
 * object back, so nothing here is persisted, keyed to a user, or cleaned up.
 * Phase F is what fills `confirmedToolIds` and `rejectedToolIds` from
 * conversational refinement; Phase E carries them faithfully so a client that
 * already sends them is not silently ignored.
 */
export interface ConversationContext {
  role?: string
  goal?: string
  constraints: string[]
  /** Tools the user accepted. */
  confirmedToolIds: string[]
  /** Tools the user turned down. Excluded from future candidate sets. */
  rejectedToolIds: string[]
  /** 1 for the first answered turn. Clamped, never rejected. */
  turn: number
}

/** One transcript entry, as the client echoes it back. */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  text: string
}

/** One step of a plan, with its tool already hydrated. */
export interface AssistantWorkflowStep {
  stage: string
  tool?: ToolSummary
  why: string
}

/**
 * The six sections of "Your AI Plan", one field each (§10.1's table).
 *
 * The field order below is the render order in the design, and the names are the
 * design's own — Tools, Agents, Workflow, Prompts, Comparison, Steps — so the
 * Phase G panel maps onto it without a translation layer.
 */
export interface AssistantPlan {
  title: string
  tools: ToolSummary[]
  agents: string[]
  workflow: AssistantWorkflowStep[]
  prompts: string
  comparison: string
  steps: string[]
}

/**
 * Diagnostics returned with every turn.
 *
 * `droppedToolIds` is the one that matters: it counts tool ids the model named
 * that retrieval never offered. It is empty in normal operation, and §10.2 calls
 * a non-empty value "the single most important metric this system emits".
 */
export interface AssistantMeta {
  /** The model that answered, or 'none' when no call was made. */
  model: string
  /** Attempts the LLM client needed, including repairs. 0 when it was not called. */
  attempts: number
  /** Candidates retrieval offered the model. */
  candidates: number
  /** Ids the model named that were not in the candidate set. */
  droppedToolIds: string[]
}

/** The body of a successful POST /api/assistant/chat (§10.2). */
export interface AssistantChatResponse {
  message: string
  intent: AssistantIntent
  understood: {
    role?: string
    goal?: string
    constraints: string[]
  }
  plan?: AssistantPlan
  followUps: string[]
  /** Echo back on the next turn. */
  context: ConversationContext
  meta: AssistantMeta
}
