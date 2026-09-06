/*
 * Deterministic conversation refinement.
 *
 * Phase E carried a ConversationContext faithfully. Phase F makes it MEAN
 * something: what the user says on turn two changes what retrieval returns on
 * turn two, and nothing about that depends on a model agreeing to cooperate.
 *
 * ── Why the refinement is deterministic and not the model's job ───────────────
 *
 * The model produces `understood` — a human-readable statement of what it took
 * the request to be — and that is the right thing to show a user. It is the
 * wrong thing to FILTER a catalogue with. A model that mis-summarises "not
 * Descript" as `constraints: ["prefers Descript"]` would, if trusted, invert the
 * one instruction the user was most explicit about, and nothing downstream could
 * tell that it had happened.
 *
 * So the state that reaches retrieval is derived here, from the user's words, by
 * lookups in catalogue/taxonomy.ts that a person can read. The model's
 * `understood` is echoed to the client and never consulted for a filter. That
 * split is the same discipline the News Agent applies to evidence: the writer
 * describes, the pipeline decides.
 *
 * ── The one thing that touches the catalogue ──────────────────────────────────
 *
 * Resolving "not Descript" to an id requires knowing which tools exist, so this
 * module takes a ToolCatalogueRepository and asks it — through the port, with
 * `search()`, one call per candidate phrase. It never reads a file, never names
 * an adapter, and an unresolvable phrase produces NOTHING rather than a
 * plausible-looking id: a user who rejects a tool that is not in the catalogue
 * has rejected nothing, and inventing an id to record their preference would put
 * a fabricated identifier into the conversation state.
 *
 * Everything else here is pure.
 */

import type { ToolCatalogueRepository } from '../catalogue/repository.ts'
import {
  CATEGORY_ROLE_AFFINITY,
  PRICING_CONSTRAINT_EXPANSION,
  PRICING_KEYWORDS,
  PRICING_RELEASE_KEYWORDS,
  isRole,
  isToolCategory,
} from '../catalogue/taxonomy.ts'
import { ASSISTANT } from '../config/limits.ts'
import type {
  ConversationContext,
  PricingTier,
  RoleName,
  ToolCategoryName,
} from '../domain/types.ts'
import { normalizeQuery, recognisedTerms } from '../retrieval/normalize.ts'
import type { Logger } from '../utils/logger.ts'

/* ═══ The canonical constraint vocabulary ══════════════════════════════════ */

/*
 * `context.constraints` is `string[]` on the wire (§11) and must stay that way —
 * the client echoes it back untouched and the panel renders it. But a string
 * with no agreed spelling is a string with no behaviour, which is exactly what
 * Phase E had: the model wrote whatever it liked into `understood.constraints`,
 * the server stored it, and nothing ever read it again.
 *
 * So the strings are drawn from a CLOSED vocabulary that this module both writes
 * and parses. A constraint the server put there on turn two is still a pricing
 * filter on turn five, because `parseConstraints` can read its own output. A
 * string that is not in the vocabulary has no effect and is not stored.
 */

/** The one pricing constraint the catalogue can actually honour. See §5 below. */
export const FREE_ONLY_CONSTRAINT = 'free tools only'

const CATEGORY_FOCUS_PREFIX = 'focus on '

export function categoryFocusConstraint(category: ToolCategoryName): string {
  return `${CATEGORY_FOCUS_PREFIX}${category}`
}

export interface ParsedConstraints {
  /** Hard pricing filter. Empty means unconstrained. */
  pricingTiers: PricingTier[]
  /** Categories to rank up. Never a filter — an inference must not delete. */
  categories: ToolCategoryName[]
}

/** Reads the canonical vocabulary back out of a context. Total; never throws. */
export function parseConstraints(constraints: readonly string[]): ParsedConstraints {
  const parsed: ParsedConstraints = { pricingTiers: [], categories: [] }

  for (const constraint of constraints) {
    const value = constraint.trim()
    if (value === FREE_ONLY_CONSTRAINT) {
      parsed.pricingTiers = [...PRICING_CONSTRAINT_EXPANSION.free]
      continue
    }
    if (value.startsWith(CATEGORY_FOCUS_PREFIX)) {
      const category = value.slice(CATEGORY_FOCUS_PREFIX.length)
      if (isToolCategory(category) && !parsed.categories.includes(category)) {
        parsed.categories.push(category)
      }
    }
  }

  return parsed
}

/* ═══ Message reading ══════════════════════════════════════════════════════ */

/**
 * Markers that introduce a tool the user does NOT want.
 *
 * Each captures the words that follow it; resolution happens against the
 * catalogue afterwards, so a marker firing on ordinary prose ("I'm not sure
 * what I need") costs one failed lookup and produces nothing.
 */
const REJECTION_MARKERS: readonly RegExp[] = [
  /\b(?:don't|dont|do not|doesn't|does not)\s+(?:want|recommend|like|suggest|use)\s+(.{2,60})/gi,
  /\bnot\s+(.{2,60})/gi,
  /\b(?:without|except|besides|apart from|other than|anything but)\s+(.{2,60})/gi,
  /\b(?:avoid|skip|drop|remove|exclude|replace)\s+(.{2,60})/gi,
  /\bno more\s+(.{2,60})/gi,
]

/** Markers that introduce a tool the user already has, or wants kept. */
const CONFIRMATION_MARKERS: readonly RegExp[] = [
  /\balready\s+(?:use|using|have|got|on|pay for)\s+(.{2,60})/gi,
  /\b(?:i|we)\s+(?:use|used|am using|'m using|are using)\s+(.{2,60})/gi,
  /\b(?:keep|keeping|stick with|sticking with|stay on|staying on|include)\s+(.{2,60})/gi,
  /\b(?:happy with|fine with|love|prefer)\s+(.{2,60})/gi,
]

/** Trailing form: "Descript works for me". Captured before the marker, not after. */
const CONFIRMATION_SUFFIX = /\b([a-z0-9][a-z0-9 .+#-]{1,40}?)\s+(?:works|work|is working)\s+(?:well\s+)?for\s+(?:me|us)\b/gi

/**
 * Filler that sits between a marker and the name.
 *
 * "don't want to use Descript" reaches resolution as "to use descript"; without
 * stripping, the only prefixes tried are "to use descript", "to use" and "to",
 * and the tool is missed. Stripped from the FRONT only — a word inside a name is
 * part of the name.
 *
 * ── Why "to" is not on this list ──────────────────────────────────────────────
 *
 * Because "Make" is a real tool whose name is an ordinary verb. Stripping a bare
 * "to" turns "I don't want to make videos" into a rejection of Make: the
 * sentence is about making videos, and the resolver would see a leading word
 * that spells a catalogue name exactly. "to" is only removed as part of a pair
 * whose second word cannot be a product — "to use", "to pay" — where what
 * follows really is a name slot.
 *
 * This is the difference between a heuristic that fails safely and one that
 * silently deletes a tool the user never mentioned.
 */
const PHRASE_LEAD_FILLER = new Set([
  'the', 'a', 'an', 'any', 'my', 'our', 'your', 'that', 'it', 'them',
  'use', 'using', 'used', 'more', 'much', 'really', 'just', 'about',
  'anymore', 'now', 'again',
])

/** Second words that make a leading "to" safe to drop. */
const TO_FOLLOWERS = new Set(['use', 'using', 'have', 'try', 'pay', 'get', 'work', 'go'])

/** Words that end a captured phrase — nothing after them is part of a name. */
const PHRASE_TERMINATORS = new Set([
  'and', 'or', 'but', 'because', 'so', 'then', 'though', 'while', 'plus',
  'instead', 'though', 'since', 'unless', 'however',
])

/** Pricing language never becomes a topic term — it is a constraint, not a task. */
const PRICING_WORDS = new Set<string>([
  ...Object.values(PRICING_KEYWORDS).flatMap((keywords) =>
    keywords.flatMap((keyword) => keyword.split(/[\s-]+/)),
  ),
  ...PRICING_RELEASE_KEYWORDS.flatMap((keyword) => keyword.split(/[\s-]+/)),
  'paid', 'pay', 'paying', 'budget', 'price', 'pricing', 'cost', 'costs',
  'money', 'cheap', 'expensive', 'subscription', 'plan', 'plans',
])

/** Splits a captured span into the words a tool name could plausibly occupy. */
function phraseWords(capture: string): string[] {
  const words = capture
    .toLowerCase()
    .split(/[^a-z0-9+.#-]+/)
    /*
     * Edge punctuation is stripped, interior punctuation is not.
     *
     * "not Descript." must resolve Descript, and "Copy.ai" must stay one word.
     * Before this, the trailing full stop travelled into the repository query as
     * part of the term, matched nothing, and the rejection silently did not
     * happen — the worst possible failure for an instruction the user was
     * completely explicit about.
     */
    .map((word) => word.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter((word) => word.length > 0)

  let start = 0
  if (words[0] === 'to' && TO_FOLLOWERS.has(words[1] ?? '')) start = 2
  while (start < words.length && PHRASE_LEAD_FILLER.has(words[start] as string)) start += 1

  const kept: string[] = []
  for (const word of words.slice(start)) {
    if (PHRASE_TERMINATORS.has(word)) break
    kept.push(word)
    if (kept.length >= ASSISTANT.maxToolPhraseWords) break
  }
  return kept
}

function collect(markers: readonly RegExp[], message: string): string[][] {
  const phrases: string[][] = []
  const seen = new Set<string>()

  for (const marker of markers) {
    // Global regexes are module-level, so lastIndex is reset before every use.
    marker.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = marker.exec(message)) !== null) {
      const words = phraseWords(match[1] ?? '')
      if (words.length === 0) continue
      const key = words.join(' ')
      if (seen.has(key)) continue
      seen.add(key)
      phrases.push(words)
      if (phrases.length >= ASSISTANT.maxToolPhrases) return phrases
    }
  }

  return phrases
}

/* ═══ Tool name resolution ═════════════════════════════════════════════════ */

/** Comparison form for a name: letters and digits only, case-folded. */
function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Resolves one captured phrase to a catalogue id, or to nothing.
 *
 * One repository call, then the match is made locally against the returned
 * records: the phrase's LEADING words must spell a tool's name or slug exactly.
 * Leading, not anywhere — "I don't want to make videos" must not resolve "Make"
 * out of the middle of a sentence, while "not Make" must resolve it.
 *
 * The longest matching name wins, so "Opus Clip" beats a hypothetical "Opus".
 */
async function resolvePhrase(
  catalogue: ToolCatalogueRepository,
  words: readonly string[],
): Promise<string | undefined> {
  if (words.length === 0) return undefined

  const page = await catalogue.search({
    q: words.join(' '),
    status: 'active',
    limit: ASSISTANT.maxContextToolIds,
  })

  let best: { id: string; length: number } | undefined

  for (const tool of page.items) {
    const nameWords = tool.name.split(/\s+/).length
    for (const length of new Set([nameWords, 1, 2, 3])) {
      if (length > words.length) continue
      const prefix = fold(words.slice(0, length).join(' '))
      if (prefix.length === 0) continue
      if (prefix !== fold(tool.name) && prefix !== fold(tool.slug)) continue
      if (!best || length > best.length) best = { id: tool.id, length }
    }
  }

  return best?.id
}

async function resolveAll(
  catalogue: ToolCatalogueRepository,
  phrases: readonly string[][],
): Promise<{ ids: string[]; words: Set<string> }> {
  const ids: string[] = []
  const words = new Set<string>()

  for (const phrase of phrases) {
    const id = await resolvePhrase(catalogue, phrase)
    if (!id) continue
    if (!ids.includes(id)) ids.push(id)
    for (const word of phrase) words.add(word)
  }

  return { ids, words }
}

/* ═══ Pricing ══════════════════════════════════════════════════════════════ */

export type PricingSignal = 'constrain' | 'release' | 'none'

/**
 * What the message says about budget.
 *
 * Release is checked FIRST and wins outright. "Paid is fine" contains no
 * constraint keyword today, but the ordering is what guarantees a future
 * overlap ("free plan is fine, but paid is fine too") resolves in the direction
 * that widens the answer rather than the one that silently keeps filtering.
 */
export function readPricingSignal(message: string): PricingSignal {
  const raw = ` ${message.toLowerCase()} `
  for (const phrase of PRICING_RELEASE_KEYWORDS) {
    if (raw.includes(phrase)) return 'release'
  }

  const normalized = normalizeQuery(message)
  if (normalized.pricingTiers.includes('free') || normalized.pricingTiers.includes('freemium')) {
    return 'constrain'
  }
  return 'none'
}

/* ═══ Role mapping ═════════════════════════════════════════════════════════ */

/**
 * Maps free text onto the taxonomy's closed role list, or onto nothing.
 *
 * Used on the model's `understood.role`, which is prose it wrote: "video
 * editor", "Video Editor", "a videographer" and "I edit YouTube videos" should
 * all become `Video Editor`, and "restaurant owner" should become undefined
 * rather than a role the catalogue has never heard of.
 *
 * Returning undefined is a real answer. The alternative — accepting arbitrary
 * text as a role — puts a value into retrieval's role signal that matches no
 * record, which reads as "the user's role has no tools" rather than "we do not
 * know their role".
 */
export function mapToRole(text: string | undefined): RoleName | undefined {
  if (!text) return undefined
  const value = text.trim()
  if (value.length === 0) return undefined
  if (isRole(value)) return value
  return normalizeQuery(value).roles[0]
}

/* ═══ Focus ════════════════════════════════════════════════════════════════ */

/** Words that turn "UI" from a topic into a stated preference. */
const FOCUS_MARKERS = [
  'mainly', 'mostly', 'primarily', 'focus on', 'focused on', 'focusing on',
  'especially', 'care about', 'only need', 'just need', 'above all',
  'most of all', 'concentrate on',
]

function statesFocus(message: string): boolean {
  const raw = message.toLowerCase()
  return FOCUS_MARKERS.some((marker) => raw.includes(marker))
}

/* ═══ The refinement ═══════════════════════════════════════════════════════ */

export interface RetrievalDirectives {
  /** The accumulated goal plus this turn's message. What retrieval scores. */
  query: string
  /** Taxonomy role, when one is known. A scoring signal, never a filter. */
  role?: RoleName
  /** Categories to rank up. Never a filter (Phase C's rule). */
  categories: ToolCategoryName[]
  /** HARD pricing filter. The user stated it, so it may delete answers. */
  pricingTiers: PricingTier[]
  /** HARD exclusion. "Not Descript" means not Descript. */
  rejectedToolIds: string[]
  /** Preference signal. */
  confirmedToolIds: string[]
}

export interface Refinement {
  /** The merged context, BEFORE the turn counter advances. */
  context: ConversationContext
  retrieval: RetrievalDirectives
  /**
   * Whether the request is still too broad to plan against.
   *
   * A server judgement, not the model's, so a clarifying turn happens for a
   * reason a test can state. See `assessBreadth`.
   */
  breadth: Breadth
}

export type Breadth = 'broad' | 'specific'

/**
 * Is there enough here to build a plan?
 *
 * "Tools for coding" names a subject and nothing else: no task, no stage of
 * work, no goal, no constraint. Any plan built from it is a guess about which of
 * a dozen coding jobs the user meant, and a wrong guess costs them more than one
 * question does.
 *
 * The measure is DISTINCT TERMS that name something in the taxonomy, not the
 * number of vocabularies that fired. That distinction is the whole rule.
 * "coding" names the Code category AND the build stage — one word, one fact,
 * two lists — and counting the lists would make "tools for coding" read as a
 * fully specified request. Counting the words that produced them does not.
 *
 * One recognised term is a SUBJECT ("coding", "marketing", "video"). Two are a
 * subject and something to do with it ("video" + "edit", "code" + "debug"),
 * which is the least a plan can be built from.
 *
 * A named goal from the taxonomy's use-case list is enough on its own: it
 * already contains both halves ("Repurpose long videos", "Debug faster").
 *
 * ── Measured over the CONVERSATION, not the message ───────────────────────────
 *
 * The input is the accumulated query — the goal carried forward plus what was
 * just said. "Free or freemium only, and not Descript" names nothing at all on
 * its own; judged alone it would look broader than the turn before it, and the
 * assistant would answer a specific refinement by asking a vaguer question.
 *
 * ── What deliberately does not count ──────────────────────────────────────────
 *
 * A role, because it is a fact about the person rather than the job, and because
 * a role is inferred from the category anyway (CATEGORY_ROLE_AFFINITY).
 * A constraint, because "free tools only" is a preference about a task nobody
 * has described yet.
 */
export function assessBreadth(input: {
  /** Query terms that hit a category, role or stage keyword. */
  recognised: readonly string[]
  useCases: readonly string[]
}): Breadth {
  if (input.useCases.length > 0) return 'specific'
  return input.recognised.length >= 2 ? 'specific' : 'broad'
}

export interface RefineOptions {
  previous: ConversationContext
  message: string
  catalogue: ToolCatalogueRepository
  logger?: Logger
}

/**
 * Merges the new turn into the conversation.
 *
 * The rules, each one testable on its own:
 *
 *   ROLE        A role the user STATES overwrites whatever was there — people
 *               correct themselves. A role merely implied by the category only
 *               fills a gap, and never replaces a stated one.
 *
 *   GOAL        Topic terms ACCUMULATE, so turn two's "not Descript" still
 *               retrieves video tools. They RESET when the new message names
 *               categories that share nothing with the ones already accumulated
 *               — that is a change of subject, not a refinement of one.
 *
 *   CONSTRAINTS Canonical strings, added and removed by explicit language. A
 *               release clears the pricing constraint rather than layering a
 *               contradiction on top of it.
 *
 *   TOOLS       Rejection beats confirmation, always, in both directions: a tool
 *               rejected this turn leaves `confirmedToolIds`, and a tool
 *               confirmed this turn leaves `rejectedToolIds`. The user's most
 *               recent word is the operative one, and a tool can never sit in
 *               both lists.
 */
export async function refineContext({
  previous,
  message,
  catalogue,
  logger,
}: RefineOptions): Promise<Refinement> {
  const normalized = normalizeQuery(message)

  /* ── Tools named in this turn ──────────────────────────────────────────── */
  const rejectedPhrases = collect(REJECTION_MARKERS, message)
  const confirmedPhrases = collect(
    CONFIRMATION_MARKERS,
    message,
  ).concat(collect([CONFIRMATION_SUFFIX], message))

  const rejected = await resolveAll(catalogue, rejectedPhrases)
  const confirmed = await resolveAll(catalogue, confirmedPhrases)

  const rejectedToolIds = bounded([...previous.rejectedToolIds, ...rejected.ids])
  const confirmedToolIds = bounded([...previous.confirmedToolIds, ...confirmed.ids])

  // Rejection wins, in whichever direction this turn moved.
  const finalRejected = rejectedToolIds.filter((id) => !confirmed.ids.includes(id))
  const finalConfirmed = confirmedToolIds.filter((id) => !finalRejected.includes(id))

  /* ── Role ──────────────────────────────────────────────────────────────── */
  const statedRole = normalized.roles[0]
  const impliedRole = normalized.categories[0]
    ? CATEGORY_ROLE_AFFINITY[normalized.categories[0]]
    : undefined
  const role = statedRole ?? previous.role ?? impliedRole

  /* ── Goal ──────────────────────────────────────────────────────────────── */
  /*
   * Terms folded, because a tool name reaching the goal would put it back into
   * the next turn's query — and the tool the user just REJECTED would be the
   * thing the query most strongly asks for.
   */
  const named = new Set([...rejected.words, ...confirmed.words].map(fold))
  const turnTerms = normalized.terms.filter(
    (term) => !PRICING_WORDS.has(term) && !named.has(fold(term)),
  )
  const previousTerms = splitGoal(previous.goal)
  const previousCategories = previous.goal ? normalizeQuery(previous.goal).categories : []
  const changedSubject =
    normalized.categories.length > 0 &&
    previousCategories.length > 0 &&
    !normalized.categories.some((category) => previousCategories.includes(category))

  const goalTerms = dropShadowed(
    (changedSubject ? turnTerms : [...previousTerms, ...turnTerms]).filter(
      (term, index, all) => all.indexOf(term) === index,
    ),
  )
  const goal = joinGoal(goalTerms.slice(0, ASSISTANT.maxGoalTerms))

  /* ── Constraints ───────────────────────────────────────────────────────── */
  const pricing = readPricingSignal(message)
  const constraints: string[] = []

  const carriedPricing =
    pricing === 'release'
      ? false
      : pricing === 'constrain' || previous.constraints.includes(FREE_ONLY_CONSTRAINT)
  if (carriedPricing) constraints.push(FREE_ONLY_CONSTRAINT)

  const carriedFocus = previous.constraints
    .filter((value) => value.startsWith(CATEGORY_FOCUS_PREFIX))
    .slice(0, ASSISTANT.maxCategoryFocus)
  const newFocus = statesFocus(message)
    ? normalized.categories.slice(0, ASSISTANT.maxCategoryFocus).map(categoryFocusConstraint)
    : []

  for (const focus of [...newFocus, ...carriedFocus]) {
    if (constraints.length >= ASSISTANT.maxConstraints) break
    if (!constraints.includes(focus)) constraints.push(focus)
  }

  const parsed = parseConstraints(constraints)

  /* ── The result ────────────────────────────────────────────────────────── */
  const context: ConversationContext = {
    constraints,
    confirmedToolIds: finalConfirmed,
    rejectedToolIds: finalRejected,
    turn: previous.turn,
  }
  if (role) context.role = role
  if (goal) context.goal = goal

  // The accumulated goal first, then what was just said. Both are scored, so the
  // current message always adds signal rather than replacing the topic.
  const query = [goal, message].filter((part) => part.length > 0).join(' ')
  const accumulated = normalizeQuery(query)

  const breadth = assessBreadth({
    /*
     * Shadowed stems dropped before counting, for the same reason they are
     * dropped from the goal: "coding" produces both "code" (its alias) and "cod"
     * (its stem), the taxonomy recognises both, and two spellings of one word
     * are not two things the user told us.
     */
    recognised: dropShadowed(recognisedTerms(accumulated.terms)),
    useCases: accumulated.useCases,
  })

  const retrieval: RetrievalDirectives = {
    query,
    categories: parsed.categories,
    pricingTiers: parsed.pricingTiers,
    rejectedToolIds: finalRejected,
    confirmedToolIds: finalConfirmed,
  }
  if (role && isRole(role)) retrieval.role = role

  logger?.debug('Context refined', {
    turn: previous.turn,
    role: role ?? null,
    goalTerms: goalTerms.length,
    constraints,
    rejected: finalRejected.length,
    confirmed: finalConfirmed.length,
    breadth,
  })

  return { context, retrieval, breadth }
}

/**
 * Drops a term that is only the truncated stem of another term already present.
 *
 * "coding" yields both "code" (its alias, the canonical catalogue spelling) and
 * "cod" (its stem, which the stemmer cannot know is nonsense). Both are useful
 * inside one query — they match different records — but only one belongs in a
 * goal a person reads and the next turn re-queries with. The longer, real word
 * is kept.
 *
 * Bounded to a two-character difference so genuinely distinct terms survive:
 * "design" does not shadow "designer", and "video" never touches "voice".
 */
function dropShadowed(terms: readonly string[]): string[] {
  return terms.filter(
    (term) =>
      !terms.some(
        (other) =>
          other !== term &&
          other.startsWith(term) &&
          other.length > term.length &&
          other.length - term.length <= 2,
      ),
  )
}

/** Deduplicates and caps an id list, preserving first-seen order. */
function bounded(ids: readonly string[]): string[] {
  return [...new Set(ids)].slice(0, ASSISTANT.maxContextToolIds)
}

/**
 * The goal is stored as a readable term list and read back as terms.
 *
 * Round-tripping matters more than prose here: the goal is re-fed into the
 * retrieval query on the next turn, so it has to survive being written to the
 * client, echoed back, and parsed again without gaining or losing a word.
 */
function joinGoal(terms: readonly string[]): string {
  return terms.join(', ').slice(0, ASSISTANT.maxGoalChars)
}

function splitGoal(goal: string | undefined): string[] {
  if (!goal) return []
  return goal
    .toLowerCase()
    .split(/[,\s]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
}
