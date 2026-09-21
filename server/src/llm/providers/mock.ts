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
interface PlanStep {
  stage: string
  toolId: string
}

interface MockAssistantReply {
  message: string
  intent: 'clarify' | 'recommend'
  understood: { role?: string; goal?: string; constraints: string[] }
  plan?: {
    steps: PlanStep[]
  }
  followUps: string[]
}

const MAX_PLAN_STEPS = 4
const MAX_FOLLOW_UPS = 3

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
  if (cards.length === 0 || options.assistantIntent === 'clarify' || isBroad(request.system)) {
    const clarify: MockAssistantReply = {
      message:
        'I need a little more to go on — what are you trying to get done, and what kind of work is it?',
      intent: 'clarify',
      understood: { constraints: constraintsFrom(userText, cards) },
      // Chips answer the question that was just asked, so a click is a reply.
      followUps: clarifyChipsFrom(cards),
    }
    const clarifyRole = roleFrom(userText)
    if (clarifyRole) clarify.understood.role = clarifyRole
    return JSON.stringify(clarify, null, 2)
  }

  const steps = buildSteps(cards)
  const chosen = steps
    .map((step) => cards.find((card) => card.id === step.toolId))
    .filter((card): card is ToolCard => card !== undefined)

  const reply: MockAssistantReply = {
    message: 'Here is a plan for that.',
    intent: 'recommend',
    understood: {
      constraints: constraintsFrom(userText, cards),
    },
    plan: { steps },
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
 * Assigns each stage one tool and each tool one stage, greedily.
 *
 * Candidates arrive already ranked, so walking them in order and taking the
 * first still-unused stage each one covers is enough: it cannot repeat a tool
 * or a stage (the schema's own two rules), and it never proposes a stage
 * nothing in the candidate set can staff, because every stage it names came
 * off a real card.
 */
function buildSteps(cards: readonly ToolCard[]): PlanStep[] {
  const usedStages = new Set<string>()
  const usedTools = new Set<string>()
  const steps: PlanStep[] = []

  for (const card of cards) {
    if (steps.length >= MAX_PLAN_STEPS) break
    if (usedTools.has(card.id)) continue
    const stage = card.stages.find((candidate) => !usedStages.has(candidate))
    if (!stage) continue
    usedStages.add(stage)
    usedTools.add(card.id)
    steps.push({ stage, toolId: card.id })
  }

  return steps
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

/**
 * Words that end a role. Nothing after one of them is part of what someone is.
 *
 * Without this the capture ran to its length limit: "I am a video editor and I
 * want to speed up my workflow" produced the role "video editor and I want to
 * spe". Schema-valid, and wrong in a way a reader notices immediately.
 */
const ROLE_TERMINATORS = new Set([
  'and', 'but', 'who', 'that', 'so', 'because', 'with', 'for', 'to', 'at',
  'in', 'on', 'i', 'we', 'my', 'our', 'looking', 'trying', 'working', 'doing',
  'building', 'making', 'currently', 'now', 'here', 'just', 'also', 'then',
])

/** Two-letter role words that are acronyms, not words. "ui" → "UI". */
const ROLE_ACRONYMS = new Set(['ui', 'ux', 'qa', 'pm', 'seo', 'it'])

/**
 * Echoes a role only when the user stated one in so many words.
 *
 * Reads the user's message, because a role genuinely is something only they can
 * tell us — unlike the goal, which this provider derives from the candidate
 * cards. It is safe because the capture admits letters, spaces, slashes and
 * hyphens only, and stops at the first word that cannot be part of a job title:
 * a URL, a tool name with digits, or a sentence cannot survive it.
 *
 * The server does not depend on this. assistant/refine.ts derives the role it
 * actually retrieves with from the taxonomy; this is the label a user reads.
 */
function roleFrom(userText: string): string | undefined {
  const match = /\b(?:i am|i'm|im|we are|we're)\s+(?:an?\s+)?([a-z][a-z /-]{2,40})/i.exec(
    userText,
  )
  if (!match?.[1]) return undefined

  const words: string[] = []
  for (const word of match[1].toLowerCase().split(/\s+/)) {
    if (ROLE_TERMINATORS.has(word)) break
    if (word.length === 0) continue
    words.push(word)
    if (words.length === 3) break
  }

  if (words.length === 0) return undefined
  return words.map(titleCase).join(' ')
}

function titleCase(word: string): string {
  if (ROLE_ACRONYMS.has(word)) return word.toUpperCase()
  // "ui/ux" and "front-end" keep their separator and capitalise both halves.
  return word.replace(/[a-z]+/g, (part) =>
    ROLE_ACRONYMS.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1),
  )
}

/**
 * Reads the server's own breadth judgement out of the system prompt.
 *
 * TRUSTED input: assistant/prompts renders it from taxonomy lookups and it
 * contains no user text (see TurnGuidance). The mock obeys it for the same
 * reason a real model is asked to — a request naming a subject and nothing else
 * has no plan in it, only a guess — and obeying it deterministically is what
 * makes the clarify-then-refine path testable offline.
 */
function isBroad(system: string): boolean {
  return /^REQUEST BREADTH: broad$/m.test(system)
}

/**
 * Follow-up chips, derived from the candidate set.
 *
 * Each chip is a REFINEMENT the user could actually say next, and each one is
 * only offered when the candidates make it a real choice: a budget chip only
 * when a paid tool is in the running, a stage chip only when the candidates
 * cover more than one stage. A chip the answer cannot change is a dead button.
 *
 * Derived rather than seeded-random. The Phase E version picked two of four
 * fixed strings from a hash of the ids: deterministic, but the chips said
 * nothing about the tools, so a test asserting they differ between candidate
 * sets proved only that the hash worked. These differ because the CANDIDATES
 * differ, which is the property Phase F needs.
 */
function followUpsFrom(cards: readonly ToolCard[]): string[] {
  const chips: string[] = []

  const hasPaid = cards.some((card) => card.pricingTier === 'paid')
  const hasFree = cards.some((card) => card.pricingTier !== 'paid')
  if (hasPaid && hasFree) chips.push('Free tools only')

  for (const stage of byFrequency(cards.flatMap((card) => card.stages))) {
    if (chips.length >= MAX_FOLLOW_UPS) break
    chips.push(`Focus on ${stage}`)
  }

  if (chips.length < MAX_FOLLOW_UPS && cards.length > 1) chips.push('Compare the top two')

  // A candidate set with one tool, one stage and one tier leaves nothing to
  // refine; the seeded fallback keeps the field non-empty without inventing a
  // choice the user does not have.
  if (chips.length === 0) {
    const options = ['Something simpler', 'Show me alternatives']
    const seed = cards.map((card) => card.id).join(',')
    chips.push(options[Math.floor(seededUnit(seed) * options.length) % options.length] as string)
  }

  return chips.slice(0, MAX_FOLLOW_UPS)
}

/**
 * Chips offered alongside a clarifying question.
 *
 * The categories the candidates actually cluster in, most common first — those
 * are the readings of the request that are still live, so picking one is the
 * answer to the question just asked. Alphabetical order would offer "Agents" and
 * "Audio" for a coding question, which is a chip that answers nothing.
 */
function clarifyChipsFrom(cards: readonly ToolCard[]): string[] {
  if (cards.length === 0) return ['Tell me your role', 'Describe the task', 'Set a budget']
  const categories = byFrequency(cards.map((card) => card.cat)).slice(0, 2)
  return [...categories.map((category) => `Mostly ${category}`), 'Free tools only'].slice(
    0,
    MAX_FOLLOW_UPS,
  )
}

/**
 * Distinct values, most frequent first, ties broken alphabetically.
 *
 * The tiebreak is not decoration: without a total order the chips would differ
 * between runs on identical input, and a test asserting determinism would be
 * asserting the iteration order of a Map.
 */
function byFrequency(values: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .map(([value]) => value)
}
