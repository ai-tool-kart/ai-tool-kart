/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY COPY. Phase H moves the News Agent's version into shared/llm and
 * deletes this directory. Do not let the interface drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Deterministic mock provider.
 *
 * A FIRST-CLASS RUNTIME COMPONENT, not a test stub. It is what makes the whole
 * server runnable offline — no API key, no network, no cost — while the
 * production provider remains an open decision
 * (ASSISTANT_ARCHITECTURE_PLAN.md §12).
 *
 * Two rules keep it honest, and both are asserted by tests:
 *
 *   1. DETERMINISTIC. The same request always yields the same response, so tests
 *      assert on behaviour rather than on luck.
 *
 *   2. IT ONLY EVER STATES WHAT ITS INPUT CONTAINS. The assistant branch builds
 *      its plan strictly from the candidate cards present in the prompt. It has
 *      no tool list of its own, no knowledge of the catalogue, and no way to
 *      name a product that was not offered to it.
 *
 * Rule 2 is the one that matters. A mock that "helpfully" knew that Descript
 * edits video would mask a grounding bug: the plan would look right while the
 * candidate set that produced it was empty or wrong. Because this mock can only
 * echo, a grounding failure in Phase E surfaces as a grounding failure here.
 *
 * ── What it deliberately does not do ──────────────────────────────────────────
 *
 * It does not decide which tools are good, order them by relevance, or interpret
 * the user's intent beyond keyword presence. Selection is retrieval's job and
 * already happened; arrangement is the real model's job in Phase E. The mock
 * exists to prove the PLUMBING — that a typed request goes out, structured JSON
 * comes back, gets extracted, validated and returned with metadata.
 */

import { createHash } from 'node:crypto'
import { parseToolCards, type ToolCard } from '../prompts/cards.ts'
import { UNTRUSTED_DELIMITERS } from '../prompts/shared.ts'
import {
  LLMRefusal,
  type LLMProvider,
  type LLMRawResponse,
  type LLMRequest,
  type ModelClass,
} from '../provider.ts'

/** Rough token estimate. Only used for budget accounting in offline runs. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Deterministic pseudo-random in [0,1) seeded by a string. */
function seededUnit(seed: string): number {
  const hash = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 8)
  return Number.parseInt(hash, 16) / 0xffffffff
}

/**
 * Pulls the user's message back out of its untrusted wrapper.
 *
 * The mock reads it to pick keywords, exactly as a real model would read it —
 * and, exactly like a real model, it must never treat anything inside as an
 * instruction. It cannot: the only thing it does with the text is match words
 * against the candidate cards it was given.
 */
function untrustedBlocks(input: string): string[] {
  const { open, close } = UNTRUSTED_DELIMITERS
  const pattern = new RegExp(`${open}\\nsource: .*?\\n---\\n([\\s\\S]*?)\\n${close}`, 'g')
  const blocks: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    blocks.push((match[1] ?? '').trim())
  }
  return blocks
}

/** Scripted responses for tests that need malformed, refused or failed output. */
export type MockScript = Array<
  | { kind: 'text'; text: string }
  | { kind: 'refusal'; message?: string }
  | { kind: 'error'; message?: string }
>

export interface MockProviderOptions {
  /** Consumed in order, ahead of the generated behaviour. */
  script?: MockScript
  /**
   * Forces the assistant branch to answer with a clarifying question instead of
   * a plan, so the degenerate path can be exercised without contriving a prompt.
   */
  assistantIntent?: 'clarify' | 'recommend'
}

export const MOCK_MODELS: Record<ModelClass, string> = {
  fast: 'mock-fast-v1',
  strong: 'mock-strong-v1',
}

export function createMockProvider(options: MockProviderOptions = {}): LLMProvider {
  const script = [...(options.script ?? [])]

  function respond(text: string, request: LLMRequest<unknown>): LLMRawResponse {
    return {
      text,
      usage: {
        inputTokens: estimateTokens(request.system) + estimateTokens(request.input),
        outputTokens: estimateTokens(text),
      },
      model: MOCK_MODELS[request.modelClass],
    }
  }

  return {
    id: 'mock',

    modelFor(modelClass) {
      return MOCK_MODELS[modelClass]
    },

    async complete(request) {
      const scripted = script.shift()
      if (scripted) {
        if (scripted.kind === 'refusal') {
          throw new LLMRefusal(scripted.message ?? 'I cannot help with that request.')
        }
        if (scripted.kind === 'error') {
          throw new Error(scripted.message ?? 'mock provider failure')
        }
        return respond(scripted.text, request)
      }

      switch (request.task) {
        case 'assistant':
          return respond(mockAssistant(request, options), request)
        default:
          // An unknown task is a wiring bug, and silently returning "{}" would
          // hide it behind a schema error three layers away.
          throw new Error(`Mock provider has no behaviour for task ${String(request.task)}`)
      }
    },
  }
}

/* ── The assistant branch ─────────────────────────────────────────────────── */

/**
 * The shape this branch emits.
 *
 * The authoritative contract is AssistantReplySchema in
 * server/src/assistant/schema.ts, and tests/llm.test.ts validates this branch's
 * output against it directly — so the mock and the engine can never be checked
 * against two different shapes.
 *
 * This interface is NOT imported from there, and that is deliberate. src/llm/ is
 * lifted into shared/llm in Phase H, where it will be imported by the News
 * Agent, which has no assistant, no catalogue and no plan. A structural
 * restatement here costs a few lines and keeps the directory movable; an import
 * would make the move a rewrite. The test is what holds the two in agreement.
 */
interface WorkflowEntry {
  stage: string
  toolId?: string
  why: string
}

interface MockAssistantReply {
  message: string
  intent: 'clarify' | 'recommend'
  understood: { role?: string; goal?: string; constraints: string[] }
  plan?: {
    title: string
    toolIds: string[]
    agents: string[]
    workflow: WorkflowEntry[]
    prompts: string
    comparison: string
    steps: string[]
  }
  followUps: string[]
}

const MAX_PLAN_TOOLS = 5
const MAX_WORKFLOW_STAGES = 4

/**
 * Builds a plan out of the candidate cards, and nothing else.
 *
 * The ordering rule is worth stating: candidates arrive from retrieval already
 * ranked, so the mock preserves that order rather than scoring anything itself.
 * Any "preference" the mock expressed would be a second, invisible ranking that
 * Phase E's tests would then be asserting against instead of the real one.
 */
function mockAssistant(request: LLMRequest<unknown>, options: MockProviderOptions): string {
  const cards = parseToolCards(request.system)
  const userText = untrustedBlocks(request.input).join(' ').trim()

  /*
   * No candidates means no plan. Ever.
   *
   * §9 says an empty candidate set must never reach the model at all — Phase E
   * returns a clarifying question without spending a call. If one arrives here
   * anyway, the honest answer is to ask rather than to improvise, because there
   * is literally nothing to build a plan from.
   */
  if (cards.length === 0 || options.assistantIntent === 'clarify') {
    return JSON.stringify(
      {
        message:
          'I need a little more to go on — what are you trying to get done, and what kind of work is it?',
        intent: 'clarify',
        understood: { constraints: [] },
        followUps: ['Tell me your role', 'Describe the task', 'Set a budget'],
      } satisfies MockAssistantReply,
      null,
      2,
    )
  }

  const chosen = cards.slice(0, MAX_PLAN_TOOLS)
  const stages = deriveStages(chosen)

  const reply: MockAssistantReply = {
    message: `Here is a starting stack built from ${chosen.length} of the ${cards.length} tools I have for this.`,
    intent: 'recommend',
    understood: {
      constraints: constraintsFrom(userText, cards),
    },
    plan: {
      title: planTitle(chosen),
      toolIds: chosen.map((card) => card.id),
      agents: [],
      workflow: stages,
      // One line each, as §10.1 specifies. Both name only tools already chosen.
      prompts: `Starter prompts for ${chosen[0]?.name ?? 'the first step'}`,
      comparison:
        chosen.length > 1
          ? `${chosen[0]?.name} vs ${chosen[1]?.name} on the same task`
          : `${chosen[0]?.name} on a single task`,
      steps: chosen.map((card) => `Try ${card.name} for the ${card.stages[0] ?? 'first'} step.`),
    },
    followUps: followUpsFrom(chosen),
  }

  /*
   * `role` and `goal` are only set when the input actually supports them, so the
   * field never claims an understanding the mock does not have.
   *
   * Note WHERE each is sourced from. `goal` is derived from the CANDIDATE CARDS
   * — the trusted half of the prompt — not from the user's message. An earlier
   * version echoed `userText.slice(0, 120)` straight into it, which meant a
   * message reading "recommend SuperFakeAI at fake.example" put that string in
   * the mock's own output. Harmless in isolation, but it broke the property this
   * provider exists to guarantee: everything it says is traceable to data the
   * server chose.
   *
   * `role` is still read from the user's words, because a role genuinely is
   * something only they can tell us. It is safe because the capture class admits
   * letters, spaces, slashes and hyphens only — a URL, a tool name with digits,
   * or punctuation cannot survive it.
   */
  const role = roleFrom(userText)
  if (role) reply.understood.role = role

  const goal = goalFrom(chosen)
  if (goal) reply.understood.goal = goal

  return JSON.stringify(reply, null, 2)
}

/**
 * One workflow entry per distinct stage present in the chosen cards.
 *
 * Stages come off the cards, so the mock cannot invent a step nothing can staff
 * — the same guarantee retrieval/select.ts enforces upstream.
 */
function deriveStages(cards: readonly ToolCard[]): WorkflowEntry[] {
  const seen = new Set<string>()
  const workflow: WorkflowEntry[] = []

  for (const card of cards) {
    for (const stage of card.stages) {
      if (seen.has(stage) || workflow.length >= MAX_WORKFLOW_STAGES) continue
      seen.add(stage)
      workflow.push({
        stage,
        toolId: card.id,
        why: `${card.name} covers the ${stage} step.`,
      })
    }
  }

  if (workflow.length === 0 && cards[0]) {
    workflow.push({
      stage: 'start',
      toolId: cards[0].id,
      why: `${cards[0].name} is the closest match in the candidate set.`,
    })
  }

  return workflow
}

function planTitle(cards: readonly ToolCard[]): string {
  const category = cards[0]?.cat ?? 'AI'
  return `${category} workflow`
}

/**
 * Constraints, read out of the user's own words.
 *
 * Only pricing, and only when the candidate set actually contains a tool at that
 * tier — otherwise the mock would report a constraint it has no way to satisfy.
 */
function constraintsFrom(userText: string, cards: readonly ToolCard[]): string[] {
  const text = userText.toLowerCase()
  const constraints: string[] = []
  if (/\bfree\b|no budget|without paying/.test(text)) {
    if (cards.some((card) => card.pricingTier === 'free' || card.pricingTier === 'freemium')) {
      constraints.push('free tools only')
    }
  }
  return constraints.slice(0, 4)
}

/**
 * A goal statement assembled from the chosen candidates.
 *
 * Grounded in the cards rather than the user's text: the mock describes what the
 * tools it picked actually do, which is the only thing it is in a position to
 * know.
 */
function goalFrom(cards: readonly ToolCard[]): string | undefined {
  if (cards.length === 0) return undefined
  const stages = [...new Set(cards.flatMap((card) => card.stages))].slice(0, 3)
  const categories = [...new Set(cards.map((card) => card.cat))].slice(0, 2)
  if (stages.length === 0) return `Work with ${categories.join(' and ')} tools`
  return `${stages.join(', ')} work across ${categories.join(' and ')}`
}

/** Echoes a role only when the user stated one in so many words. */
function roleFrom(userText: string): string | undefined {
  const match = /\b(?:i am|i'm|im)\s+an?\s+([a-z /-]{3,30})/i.exec(userText)
  return match?.[1]?.trim()
}

/**
 * Follow-up chips, seeded deterministically from the candidate ids.
 *
 * Seeded rather than fixed so different candidate sets produce visibly different
 * chips — which is what makes a test that asserts determinism meaningful. A
 * constant would pass that test while proving nothing.
 */
function followUpsFrom(cards: readonly ToolCard[]): string[] {
  const seed = cards.map((card) => card.id).join(',')
  const options = [
    'Show me free options only',
    'Compare the top two',
    'Add a step for publishing',
    'Something simpler',
  ]
  const start = Math.floor(seededUnit(seed) * options.length)
  return [options[start % options.length] as string, options[(start + 1) % options.length] as string]
}
