/*
 * Query normalisation.
 *
 * Ported from queryTerms() / INTENT_MAP / STOPWORDS in the design handoff
 * (ai tool kart ui design v2/AI Tool Kart Site.dc.html), then extended with the
 * role, category, stage and goal recognition the design never needed because it
 * only ever filtered a twelve-record mock array.
 *
 * Two rules hold this module in shape:
 *
 *   DETERMINISTIC. Same input, same output, no clock, no randomness, no I/O.
 *   That is what lets tests/retrieval.test.ts assert exact rankings.
 *
 *   INSPECTABLE. Every inference is a lookup in a list that lives in
 *   catalogue/taxonomy.ts and can be read by a person. When a recommendation is
 *   wrong you can point at the line that caused it.
 *
 * This is explicitly NOT an NLP layer. There is no tokeniser model, no
 * embedding, no dependency. A catalogue in the tens does not need one, and the
 * moment one is introduced the "why did it recommend that" question stops
 * having an answer (ASSISTANT_ARCHITECTURE_PLAN.md §9).
 */

import { RETRIEVAL } from '../config/limits.ts'
import {
  CATEGORY_KEYWORDS,
  PRICING_CONSTRAINT_EXPANSION,
  PRICING_KEYWORDS,
  ROLE_KEYWORDS,
  STAGE_DEFINITIONS,
  USE_CASES,
  type PricingTier,
  type RoleName,
  type ToolCategoryName,
  type WorkflowStage,
} from '../catalogue/taxonomy.ts'

/**
 * Words carrying no retrieval signal.
 *
 * The design's list, extended with the intent verbs and intensifiers that show
 * up in every natural-language tool search — "help me make something better,
 * faster". Dropping them matters: they appear in so many taglines and summaries
 * that leaving them in lets textOverlap reward every record equally, which is
 * the same as rewarding none.
 *
 * Domain verbs are deliberately NOT here. "design", "build", "edit", "write",
 * "research" and "automate" are stage names — dropping them would delete the
 * strongest signal in a query like "help me design a landing page".
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  // The design's original list.
  'ai', 'tool', 'tools', 'for', 'my', 'the', 'a', 'an', 'of', 'and', 'to', 'in',
  'on', 'me', 'i', 'best', 'with', 'from', 'what', 'want', 'need', 'how', 'do',
  'your', 'you',
  // Grammar and filler.
  'are', 'is', 'it', 'be', 'am', 'was', 'were', 'been', 'can', 'could', 'should',
  'would', 'will', 'about', 'into', 'out', 'up', 'so', 'that', 'this', 'these',
  'those', 'there', 'their', 'our', 'its', 'as', 'at', 'by', 'or', 'but', 'not',
  'have', 'has', 'had', 'we', 'us', 'they', 'them', 'he', 'she', 'his', 'her',
  'if', 'when', 'which', 'who', 'any', 'all', 'some', 'more', 'most', 'much',
  'many', 'less', 'other', 'than', 'then', 'just', 'also', 'very', 'really',
  // Intent verbs and intensifiers that survive in almost every query.
  'help', 'helps', 'make', 'makes', 'making', 'get', 'gets', 'getting', 'got',
  'use', 'uses', 'using', 'let', 'lets', 'give', 'please', 'looking', 'look',
  'good', 'great', 'better', 'nice', 'faster', 'fast', 'quick', 'quickly',
  'easy', 'easily', 'simple', 'simply', 'new', 'like', 'thing', 'things',
  'stuff', 'something', 'someone', 'way', 'ways', 'lot', 'bit',
  /*
   * Hedges and emphasis (Phase F).
   *
   * A refinement turn is mostly made of these — "mostly debugging and UI", "I
   * only really care about X" — and they were surviving into the accumulated
   * conversation goal, which is re-fed into the next turn's query. "mostly" and
   * "care" then scored against every summary containing them, and read as part
   * of the topic when a person looked at the context.
   */
  'mostly', 'mainly', 'primarily', 'especially', 'only', 'still', 'even',
  'care', 'cares', 'sure', 'maybe', 'perhaps', 'probably', 'actually',
  'currently', 'definitely', 'etc', 'ones', 'rather', 'quite', 'pretty',
])

/**
 * Whole-query shortcuts.
 *
 * The design's INTENT_MAP, kept because it does a job term extraction cannot:
 * it guarantees the hero suggestion chips never dead-end. Keys are matched
 * against the lowercased, trimmed query — an exact match short-circuits term
 * extraction entirely.
 */
export const INTENT_MAP: Record<string, readonly string[]> = {
  'create videos from text': ['video', 'generate'],
  'ai tools for ui design': ['design', 'ui'],
  'automate my workflow': ['automate', 'workflow', 'agent'],
  'best ai coding agents': ['code', 'agent'],
  'ai tools for students': ['research', 'writing', 'study'],
  'edit videos faster': ['edit', 'video'],
  'grow my restaurant': ['marketing', 'social', 'campaign'],
  'automate client follow-ups': ['automate', 'email', 'outreach'],
  'study smarter': ['study', 'research', 'notes'],
  'launch a saas landing page': ['landing', 'website', 'copy', 'design'],
}

/**
 * Per-term synonyms, applied after stemming.
 *
 * A term expands to itself plus its synonyms, so "vo" contributes "voice" and
 * "voiceover" without losing the original. Kept to genuine aliases — this is not
 * a thesaurus, and every entry here is a term real users type that the catalogue
 * spells differently.
 */
export const TERM_SYNONYMS: Record<string, readonly string[]> = {
  pic: ['image', 'photo'],
  pix: ['image', 'photo'],
  photo: ['image'],
  picture: ['image'],
  img: ['image'],
  vid: ['video'],
  movie: ['video'],
  yt: ['video', 'youtube'],
  short: ['shorts', 'clip'],
  reel: ['shorts', 'clip', 'social'],
  tiktok: ['shorts', 'social', 'video'],
  vo: ['voice', 'voiceover'],
  tts: ['voice', 'speech'],
  narrate: ['voice', 'narration'],
  dev: ['code', 'developer'],
  coding: ['code'],
  programming: ['code'],
  bug: ['debug'],
  repo: ['code', 'repository'],
  frontend: ['code', 'ui'],
  backend: ['code', 'api'],
  /*
   * "ui" and "ux" are two characters, so the length guard drops them before
   * they can reach the Design keyword index — the design category was
   * unreachable from "mostly debugging and UI", which is the exact sentence
   * Phase F refinement is built around. An alias fires ahead of the guard, the
   * same mechanism "vo" and "yt" already rely on.
   */
  ui: ['design', 'interface'],
  ux: ['design', 'usability'],
  react: ['code', 'frontend'],
  python: ['code'],
  javascript: ['code'],
  typescript: ['code'],
  deck: ['presentation', 'slide'],
  slides: ['presentation', 'slide'],
  slideshow: ['presentation', 'slide'],
  ppt: ['presentation', 'slide'],
  powerpoint: ['presentation', 'slide'],
  seo: ['seo', 'marketing', 'search'],
  ads: ['ad', 'marketing'],
  advert: ['ad', 'marketing'],
  copywriting: ['copy', 'writing'],
  blogging: ['blog', 'writing'],
  spreadsheet: ['data', 'spreadsheet'],
  excel: ['data', 'spreadsheet'],
  sql: ['data', 'query'],
  dashboard: ['data', 'dashboard'],
  paper: ['paper', 'research'],
  papers: ['paper', 'research'],
  literature: ['paper', 'research'],
  citation: ['citation', 'research'],
  zap: ['automate', 'workflow'],
  workflow: ['workflow', 'automate'],
  repetitive: ['repetitive', 'automate'],
  busywork: ['repetitive', 'automate'],
  chore: ['repetitive', 'automate'],
  meeting: ['meeting', 'notes'],
  podcast: ['podcast', 'audio'],
  wireframe: ['wireframe', 'design'],
  mockup: ['mockup', 'design'],
  logo: ['logo', 'brand'],
  thumbnail: ['thumbnail', 'image'],
}

/**
 * Lightweight stemmer.
 *
 * Handles plurals and the -ing / -ed inflections that separate a query verb
 * from a catalogue noun: "editing" must reach a record tagged "edit", and
 * "videos" must reach "video". That is the whole job.
 *
 * Length guards keep it from mangling short words — "ring" must not become "r",
 * "bed" must not become "b". Everything below the guard is left alone, which is
 * the right failure mode: a missed stem costs one signal, a wrong stem invents
 * a term that matches nothing.
 */
export function stem(word: string): string {
  let value = word

  if (value.length > 5 && value.endsWith('ies')) {
    return `${value.slice(0, -3)}y` // "queries" -> "query"
  }
  if (value.length > 5 && (value.endsWith('ches') || value.endsWith('shes') || value.endsWith('sses'))) {
    return value.slice(0, -2) // "searches" -> "search"
  }
  if (value.length > 4 && value.endsWith('s') && !value.endsWith('ss') && !value.endsWith('us')) {
    value = value.slice(0, -1) // "videos" -> "video"
  }
  if (value.length > 5 && value.endsWith('ing')) {
    const base = value.slice(0, -3)
    // "editing" -> "edit"; "running" -> "run" via the doubled-consonant check.
    if (base.length > 2 && base.at(-1) === base.at(-2)) return base.slice(0, -1)
    return base
  }
  if (value.length > 5 && value.endsWith('ed')) {
    const base = value.slice(0, -2)
    if (base.length > 2 && base.at(-1) === base.at(-2)) return base.slice(0, -1)
    return base
  }
  return value
}

/**
 * Splits on anything that is not alphanumeric, keeping "+", "." and "#".
 *
 * Those three are kept because catalogue names use them — "Copy.ai", "n8n",
 * "C#". Which means sentence punctuation attaches too: "mostly debugging and
 * UI." tokenised to "ui.", which is not "ui", so the Design alias never fired
 * and the sentence read as having no design signal at all. Edge punctuation is
 * therefore trimmed and interior punctuation is not — "copy.ai" survives, "ui."
 * becomes "ui".
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+.#]+/)
    .map((token) => token.replace(/^[.#]+|[.#]+$/g, ''))
    .filter((token) => token.length > 0)
}

/**
 * The design's queryTerms(), preserved in behaviour and extended in reach.
 *
 * Order of operations: whole-query intent lookup, then tokenise, drop
 * stopwords and short tokens, stem, expand synonyms, dedupe.
 */
export function queryTerms(query: string): string[] {
  const trimmed = query.trim().toLowerCase()
  const intent = INTENT_MAP[trimmed]
  if (intent) return [...intent]

  const terms: string[] = []
  const seen = new Set<string>()
  const add = (term: string): void => {
    if (term.length < RETRIEVAL.minTermLength) return
    if (seen.has(term)) return
    seen.add(term)
    terms.push(term)
  }

  for (const token of tokenize(trimmed)) {
    if (STOPWORDS.has(token)) continue

    /*
     * An explicit alias bypasses the length guard.
     *
     * The guard exists to drop noise, but "vo" and "yt" are two-character terms
     * somebody deliberately put in TERM_SYNONYMS. Applying the guard first made
     * those entries unreachable — dead configuration that reads as working.
     */
    const alias = TERM_SYNONYMS[token]
    if (alias) for (const synonym of alias) add(synonym)

    if (token.length < RETRIEVAL.minTermLength) continue
    const stemmed = stem(token)
    if (STOPWORDS.has(stemmed)) continue
    add(stemmed)
    if (!alias) for (const synonym of TERM_SYNONYMS[stemmed] ?? []) add(synonym)
  }

  return terms
}

/* ─── Vocabulary recognition ───────────────────────────────────────────────── */

/**
 * Keyword indexes, built once at module load.
 *
 * The taxonomy lists keywords per vocabulary entry; retrieval needs the inverse.
 * Multi-word keywords ("product designer", "no budget") cannot be matched
 * term-by-term, so they are held separately and matched as substrings against
 * the raw query.
 */
interface KeywordIndex<T> {
  byTerm: Map<string, T[]>
  phrases: Array<{ phrase: string; value: T }>
}

function buildIndex<T extends string>(source: Record<T, readonly string[]>): KeywordIndex<T> {
  const byTerm = new Map<string, T[]>()
  const phrases: Array<{ phrase: string; value: T }> = []

  for (const [value, keywords] of Object.entries(source) as Array<[T, readonly string[]]>) {
    for (const keyword of keywords) {
      if (keyword.includes(' ') || keyword.includes('-')) {
        phrases.push({ phrase: keyword.toLowerCase(), value })
        continue
      }
      const key = stem(keyword.toLowerCase())
      const bucket = byTerm.get(key)
      if (bucket) {
        if (!bucket.includes(value)) bucket.push(value)
      } else {
        byTerm.set(key, [value])
      }
    }
  }

  return { byTerm, phrases }
}

/**
 * Resolves an index against a query, ranking hits by how many terms fired.
 *
 * Ranking matters: "edit my youtube videos and post the clips" fires Video far
 * more than it fires Marketing, and the caller frequently wants only the
 * strongest few.
 */
function resolve<T extends string>(
  index: KeywordIndex<T>,
  terms: readonly string[],
  raw: string,
): T[] {
  const hits = new Map<T, number>()
  const bump = (value: T, weight: number): void => {
    hits.set(value, (hits.get(value) ?? 0) + weight)
  }

  for (const term of terms) {
    for (const value of index.byTerm.get(term) ?? []) bump(value, 1)
  }
  // A multi-word phrase is a stronger signal than a single term, so it counts
  // double: "product designer" is unambiguous where "designer" alone is not.
  for (const { phrase, value } of index.phrases) {
    if (raw.includes(phrase)) bump(value, 2)
  }

  return [...hits.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .map(([value]) => value)
}

const CATEGORY_INDEX = buildIndex(CATEGORY_KEYWORDS)
const ROLE_INDEX = buildIndex(ROLE_KEYWORDS)
const PRICING_INDEX = buildIndex(PRICING_KEYWORDS)
const STAGE_INDEX = buildIndex(
  Object.fromEntries(STAGE_DEFINITIONS.map((stage) => [stage.id, stage.keywords])) as Record<
    WorkflowStage,
    readonly string[]
  >,
)

/**
 * Goal recognition.
 *
 * Each goal is reduced to its own content terms once, at load. A goal is
 * inferred when the query shares at least two of them, or when the goal's
 * phrase appears in the query verbatim.
 *
 * The two-term floor is the whole design. At one shared term "research papers
 * faster" would infer "Research a topic", "Research competitors", "Research
 * users", "Research the market" and "Research documentation" — five goals, all
 * from the word "research", which the category and stage signals already
 * captured. A signal that fires for everything is noise.
 */
const GOAL_TERMS: ReadonlyArray<{ goal: string; phrase: string; terms: Set<string> }> =
  USE_CASES.map((goal) => ({
    goal,
    phrase: goal.toLowerCase(),
    terms: new Set(queryTerms(goal)),
  }))

function resolveUseCases(terms: readonly string[], raw: string): string[] {
  const termSet = new Set(terms)
  const matched: Array<{ goal: string; shared: number }> = []

  for (const { goal, phrase, terms: goalTerms } of GOAL_TERMS) {
    if (raw.includes(phrase)) {
      matched.push({ goal, shared: goalTerms.size + 1 })
      continue
    }
    let shared = 0
    for (const term of goalTerms) if (termSet.has(term)) shared += 1
    if (shared >= 2) matched.push({ goal, shared })
  }

  return matched
    .sort((a, b) => (b.shared !== a.shared ? b.shared - a.shared : a.goal.localeCompare(b.goal)))
    .map(({ goal }) => goal)
}

/**
 * The subset of `terms` that names something in the taxonomy.
 *
 * Used by assistant/refine.ts to answer "how much has the user actually told
 * us", which is a question about DISTINCT information rather than about how many
 * vocabularies a word happens to appear in. "coding" names the Code category and
 * the build stage; counting those separately would make one word look like two
 * facts, and "tools for coding" would read as a specific request.
 */
export function recognisedTerms(terms: readonly string[]): string[] {
  return terms.filter(
    (term) =>
      CATEGORY_INDEX.byTerm.has(term) ||
      ROLE_INDEX.byTerm.has(term) ||
      STAGE_INDEX.byTerm.has(term),
  )
}

/* ─── The public shape ─────────────────────────────────────────────────────── */

/** Caller-supplied context. Always wins over anything inferred from the text. */
export interface QueryContext {
  role?: RoleName
  categories?: ToolCategoryName[]
  stages?: WorkflowStage[]
  pricingTiers?: PricingTier[]
  /** Ids the user has already rejected. Never recommended again. */
  rejectedToolIds?: string[]
  /**
   * Ids the user said they already use or want kept.
   *
   * A PREFERENCE, not a filter: it adds a scoring signal, so a confirmed tool
   * rises when it is relevant and still loses to a better match when it is not.
   * Forcing it into every plan would be worse than ignoring it — the user would
   * see their existing tool recommended for a job it does not do.
   */
  confirmedToolIds?: string[]
}

export interface NormalizedQuery {
  /** The original text, lowercased and trimmed. Never re-parsed downstream. */
  raw: string
  terms: string[]
  categories: ToolCategoryName[]
  roles: RoleName[]
  stages: WorkflowStage[]
  useCases: string[]
  pricingTiers: PricingTier[]
  rejectedToolIds: string[]
  confirmedToolIds: string[]
  /** True when nothing at all could be extracted — the caller must clarify. */
  empty: boolean
}

/** Context values first, then inferred values, deduplicated, order preserved. */
function merge<T>(explicit: readonly T[] | undefined, inferred: readonly T[]): T[] {
  return [...new Set([...(explicit ?? []), ...inferred])]
}

export function normalizeQuery(query: string, context: QueryContext = {}): NormalizedQuery {
  const raw = query.trim().toLowerCase()
  const terms = queryTerms(query)

  const categories = merge(context.categories, resolve(CATEGORY_INDEX, terms, raw))
  const roles = merge(context.role ? [context.role] : [], resolve(ROLE_INDEX, terms, raw))
  const stages = merge(context.stages, resolve(STAGE_INDEX, terms, raw)).slice(
    0,
    RETRIEVAL.maxInferredStages,
  )
  // Inferred budget words are widened (see PRICING_CONSTRAINT_EXPANSION);
  // a tier the caller supplied explicitly is taken at face value.
  const inferredTiers = resolve(PRICING_INDEX, terms, raw).flatMap(
    (tier) => PRICING_CONSTRAINT_EXPANSION[tier],
  )
  const pricingTiers = merge(context.pricingTiers, inferredTiers)
  const useCases = resolveUseCases(terms, raw)

  return {
    raw,
    terms,
    categories,
    roles,
    stages,
    useCases,
    pricingTiers,
    rejectedToolIds: [...new Set(context.rejectedToolIds ?? [])],
    confirmedToolIds: [...new Set(context.confirmedToolIds ?? [])],
    empty:
      terms.length === 0 &&
      categories.length === 0 &&
      roles.length === 0 &&
      stages.length === 0,
  }
}
