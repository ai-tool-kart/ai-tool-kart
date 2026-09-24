/*
 * The wire contract of POST /api/assistant/chat.
 *
 * These interfaces mirror `server/src/domain/types.ts` field for field. They are
 * duplicated rather than imported because the client is a separate TypeScript
 * project with its own tsconfig and build — but they are a COPY of a contract,
 * not a second definition of it. The server's schema is authoritative; if the
 * two ever disagree, this file is the one that is wrong.
 *
 * Nothing here is optional-by-convenience. `plan` is absent for `clarify` and
 * `off_topic` because the server genuinely does not send one, and `role`/`goal`
 * are absent when the assistant has not understood them yet. Rendering has to
 * handle all three cases, so the types make them impossible to forget.
 */

import type { NicheName } from '@/types/automation'

/** What the assistant understood the turn to be. Drives nothing but copy. */
export type AssistantIntent = 'clarify' | 'recommend' | 'refine' | 'explain' | 'off_topic'

/** The catalogue's three pricing tiers (server `PRICING_TIERS`). */
export type ToolPricingTier = 'free' | 'freemium' | 'paid'

/**
 * A tool as the plan carries it.
 *
 * The server hydrates every id against the real catalogue before responding, so
 * a tool that reaches this type is one that exists and is active. The frontend
 * never has to check.
 */
export interface AssistantToolSummary {
  id: string
  slug: string
  name: string
  /** Two-character monogram for the avatar. */
  mono: string
  cat: string
  tagline: string
  /** Plainer restatement of the tagline for a plan step. Absent on most tools. */
  plainLine?: string
  pricingTier: ToolPricingTier
  /** Display string, e.g. "Free tier + paid plans". Not parseable. */
  price: string
  rating: number
  url: string
  stages: string[]
}

/**
 * One step of the plan: one plain-language action, the tool that leads it,
 * and its runners-up. `action` and the tools' tagline/pricing are the
 * server's own words, read off the catalogue at answer time — never text the
 * model wrote.
 *
 * `alsoGood` holds other tools that scored well for this same stage, ranked
 * below `tool`. Possibly empty — a step is not required to have alternates.
 */
export interface AssistantPlanStep {
  action: string
  tool: AssistantToolSummary
  alsoGood: AssistantToolSummary[]
}

/** The plan: the user's own goal line, and a short list of steps. */
export interface AssistantPlan {
  goal: string
  steps: AssistantPlanStep[]
}

/** The assistant's read of the request, echoed back so it can be corrected. */
export interface AssistantUnderstood {
  role?: string
  goal?: string
  constraints: string[]
}

/**
 * Conversation state the server owns and the client only carries.
 *
 * It is returned by every turn and posted back unchanged on the next one. The
 * client must not synthesise or edit it: `confirmedToolIds`/`rejectedToolIds`
 * are how "not Descript" survives to turn three, and a client that rebuilt them
 * would be re-implementing the refinement layer.
 */
export interface ConversationContext {
  role?: string
  goal?: string
  constraints: string[]
  confirmedToolIds: string[]
  rejectedToolIds: string[]
  turn: number
}

/** One prior turn, as the server's history schema accepts it. */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  text: string
}

/** Diagnostics. Not rendered; useful in the console when a plan looks wrong. */
export interface AssistantMeta {
  model: string
  attempts: number
  candidates: number
  droppedToolIds: string[]
}

/**
 * The step-by-step guide shown above a plan. Picked by the server from its own
 * automation match; niche and slug together because slugs repeat across niches.
 */
export interface AssistantAutomation {
  title: string
  niche: NicheName
  slug: string
}

export interface AssistantChatResponse {
  message: string
  intent: AssistantIntent
  understood: AssistantUnderstood
  plan?: AssistantPlan
  /** Only on a recommend turn whose message matched an automation well. */
  automation?: AssistantAutomation
  /** Refinement chips offered under the answer. At most three. */
  followUps: string[]
  context: ConversationContext
  meta: AssistantMeta
}

/**
 * Which directory the conversation happens in — mirrors the server's
 * CATALOGUE_KINDS. 'mcp' confines recommendations to MCP servers; 'workflow'
 * and absent both mean the whole catalogue, so Home sends nothing.
 */
export type CatalogueKind = 'workflow' | 'mcp'

/**
 * Who wrote the message — mirrors the server's ASSISTANT_REQUEST_SOURCES.
 * 'typed' is the chat box, its chips and the hero search; 'setup' is a setup
 * card's composeSetupRequest; 'build' is the "Build Your AI Setup" sentence.
 * The server matches only typed messages against the automations.
 */
export type AssistantRequestSource = 'typed' | 'setup' | 'build'

export interface AssistantChatRequest {
  message: string
  messages?: ConversationMessage[]
  context?: ConversationContext
  kind?: CatalogueKind
  /** Absent is 'typed' on the server. */
  source?: AssistantRequestSource
}

/*
 * ─── UI-side models ──────────────────────────────────────────────────────────
 *
 * Below the wire contract. A `ChatTurn` is a rendered bubble, which is not the
 * same thing as a `ConversationMessage`: it carries the follow-up chips that
 * belong to the bubble and a stable key for React.
 */

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Refinement chips rendered under an assistant bubble. */
  followUps?: string[]
}

/** Where the assistant stage is in its request cycle. */
export type AssistantStatus = 'idle' | 'thinking' | 'ready' | 'error'
