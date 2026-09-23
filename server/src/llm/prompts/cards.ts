/*
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY — but NOT part of the Phase H move.
 *
 * shared/llm receives provider.ts, client.ts, budget.ts and factory.ts. This
 * file is server-specific and becomes assistant/prompts/cards.ts instead. It
 * lives under llm/ during Phases D–G for one reason: the mock provider is its
 * second consumer, and the format has to be defined in exactly one place or the
 * writer and the reader drift apart silently.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Candidate tool cards — the serialisation contract between the prompt and the
 * model (ASSISTANT_ARCHITECTURE_PLAN.md §7).
 *
 * Candidates are the TRUSTED half of the assistant prompt: we authored the
 * catalogue, validated every record at boot, and selected these deterministically
 * in retrieval/select.ts. They go in the system prompt, unwrapped.
 *
 * ── Why a compact line format and not JSON ────────────────────────────────────
 *
 * The plan budgets roughly forty tokens per card and 1.5k for a full candidate
 * set of forty. JSON spends a third of that on punctuation and repeated key
 * names. A fixed field order with a rare separator costs less and reads more
 * clearly in a prompt, which matters because a model skims a table better than
 * it skims an array of objects.
 *
 * ── Why the mock parses these back out ────────────────────────────────────────
 *
 * The mock provider must be unable to name a tool that was not offered to it. It
 * achieves that by reading its answer out of this table rather than out of its
 * own knowledge — so if grounding ever breaks, the mock surfaces it instead of
 * papering over it with a real product name it happens to know.
 */

/**
 * The projection of a catalogue record the model is shown.
 *
 * Its display fields are structurally compatible with domain/types.ts
 * ToolSummary, but declared independently on purpose: nothing under llm/ may
 * import the server's domain, or the directory cannot be lifted into a shared
 * package in Phase H. `score` is the one field ToolSummary does not carry —
 * it is retrieval's own number, not a display fact about the tool.
 */
export interface ToolCard {
  id: string
  name: string
  cat: string
  pricingTier: string
  stages: string[]
  tagline: string
  /**
   * The candidate's own retrieval relevance score, unrounded at the type
   * level but rendered to two decimal places on the wire (`formatToolCard`).
   * Carried so a step-building pass can apply a score-relative cutoff — "at
   * least 75% of the leader" — without the server narrowing the candidate
   * pool itself and starving breadth/follow-up signals that need it broad.
   */
  score: number
}

/** Field separator. A middle dot cannot appear in a slug, tier or stage. */
const FIELD = ' · '
/** Line prefix, so a card is unambiguous even inside surrounding prose. */
const PREFIX = '- '

const HEADER = [
  'CANDIDATE TOOLS',
  '',
  'These are the only tools you may recommend. Each line is:',
  '  id · name · category · pricing · stages · what it does · score',
  '',
  'score is this candidate\'s own retrieval relevance, highest first. When',
  'building a plan step, only use tools scoring at least 75% of the highest',
  'score on this list.',
  '',
  'Use the id exactly as written. A tool that is not on this list does not exist.',
  '',
].join('\n')

/** Collapses anything that would break the one-card-per-line contract. */
function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').split(FIELD).join(' - ').trim()
}

export function formatToolCard(card: ToolCard): string {
  return (
    PREFIX +
    [
      card.id,
      sanitize(card.name),
      sanitize(card.cat),
      sanitize(card.pricingTier),
      card.stages.join('/'),
      sanitize(card.tagline),
      card.score.toFixed(2),
    ].join(FIELD)
  )
}

/**
 * Renders the candidate table for the system prompt.
 *
 * An empty set returns an empty string rather than a header with no rows.
 * ASSISTANT_ARCHITECTURE_PLAN.md §9 is explicit that an empty candidate set must
 * never reach the model at all — Phase E returns a clarifying question without
 * calling the LLM — so an empty table is a bug this function refuses to dress up
 * as a prompt.
 */
export function formatToolCards(cards: readonly ToolCard[]): string {
  if (cards.length === 0) return ''
  return HEADER + cards.map(formatToolCard).join('\n')
}

/**
 * Reads the candidate table back out of a prompt.
 *
 * Used by the mock provider so its answers can be grounded in its input. A line
 * that does not have every field is skipped rather than half-parsed: a partial
 * card is exactly how a mock would end up inventing a tool id.
 */
export function parseToolCards(prompt: string): ToolCard[] {
  const cards: ToolCard[] = []

  for (const line of prompt.split('\n')) {
    if (!line.startsWith(PREFIX)) continue
    const parts = line.slice(PREFIX.length).split(FIELD)
    if (parts.length !== 7) continue

    const [id, name, cat, pricingTier, stages, tagline, scoreText] = parts
    if (!id || !name || !cat || !pricingTier || stages === undefined || !tagline || !scoreText) {
      continue
    }
    const score = Number.parseFloat(scoreText)
    if (!Number.isFinite(score)) continue

    cards.push({
      id: id.trim(),
      name: name.trim(),
      cat: cat.trim(),
      pricingTier: pricingTier.trim(),
      stages: stages.split('/').map((stage) => stage.trim()).filter((stage) => stage.length > 0),
      tagline: tagline.trim(),
      score,
    })
  }

  return cards
}
