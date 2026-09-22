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
 * One step of the plan: one plain-language action and the one tool that does
 * it. `action` and the tool's tagline/pricing are the server's own words, read
 * off the catalogue at answer time — never text the model wrote.
 */
export interface AssistantPlanStep {
  action: string
  tool: AssistantToolSummary
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

export interface AssistantChatResponse {
  message: string
  intent: AssistantIntent
  understood: AssistantUnderstood
  plan?: AssistantPlan
  /** Refinement chips offered under the answer. At most three. */
  followUps: string[]
  context: ConversationContext
  meta: AssistantMeta
}

export interface AssistantChatRequest {
  message: string
  messages?: ConversationMessage[]
  context?: ConversationContext
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
