/*
 * Automation search — SPEC-automations.md §7.
 *
 *   score = titlePhrase  · the whole query appears in the title
 *         + titleTerms   · share of query terms in the title
 *         + intentTerms  · share of query terms in the intent labels
 *         + personaTerms · share of query terms in the persona
 *         + toolTerms    · share of query terms in the tool names
 *         + trust        · trustScore / 5
 *
 * Weights are AUTOMATION_MATCH_WEIGHTS in config/limits.ts, never literals
 * here (boundary.test.ts enforces it).
 *
 * ── Why not retrieval/ ───────────────────────────────────────────────────────
 *
 * retrieval/score.ts is typed to Tool and infers category and stage from the
 * query. An automation does not need inference: the client already wrote the
 * Task Title and Intent Labels as the phrases a user types, so plain term
 * overlap against those is the better signal. The one thing borrowed is the
 * word-level vocabulary — `stem` and `STOPWORDS` — so "editing videos" and
 * "edit video" meet the same way in both searches. INTENT_MAP is deliberately
 * NOT used: it rewrites whole queries into catalogue stage/category words,
 * which is the behaviour that broke "automate client follow-ups".
 *
 * Pure: no IO, nothing async. It scores exactly the automations it is given;
 * the caller decides which those are (normally a repository's active list).
 */

import { AUTOMATION_MATCH, AUTOMATION_MATCH_WEIGHTS } from '../config/limits.ts'
import type { CatalogueKind } from '../domain/types.ts'
import { STOPWORDS, stem } from '../retrieval/normalize.ts'
import type { Automation } from './types.ts'

export interface AutomationMatchOptions {
  /** Only automations in this niche. */
  niche?: string
  /** Only automations of this kind. Absent means both. */
  kind?: CatalogueKind
  /** Results to return; clamped to AUTOMATION_MATCH.maxLimit. */
  limit?: number
}

/** Each signal's weighted contribution — the answer to "why is this ranked here". */
export interface AutomationMatchSignals {
  titlePhrase: number
  titleTerms: number
  intentTerms: number
  personaTerms: number
  toolTerms: number
  trust: number
}

export interface AutomationMatch {
  automation: Automation
  score: number
  signals: AutomationMatchSignals
}

export interface AutomationMatcher {
  match(query: string, options?: AutomationMatchOptions): AutomationMatch[]
}

interface Indexed {
  automation: Automation
  /** Lowercased, punctuation collapsed to single spaces, padded for whole-word search. */
  phrase: string
  title: ReadonlySet<string>
  intent: ReadonlySet<string>
  persona: ReadonlySet<string>
  tools: ReadonlySet<string>
}

/** Lowercase words, punctuation collapsed, single-spaced. Used for the phrase hit. */
function phraseOf(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Stemmed content terms: stopwords and short words dropped, deduplicated. */
export function termsOf(text: string): string[] {
  const seen = new Set<string>()
  for (const word of phraseOf(text).split(' ')) {
    if (word.length < AUTOMATION_MATCH.minTermLength || STOPWORDS.has(word)) continue
    seen.add(stem(word))
  }
  return [...seen]
}

/** Share of the query's terms that the field contains, 0–1. */
function share(query: readonly string[], field: ReadonlySet<string>): number {
  if (query.length === 0) return 0
  let hits = 0
  for (const term of query) if (field.has(term)) hits += 1
  return hits / query.length
}

/**
 * Indexes the automations once, so scoring a query costs set lookups rather
 * than re-tokenising every record every time.
 */
export function createAutomationMatcher(automations: readonly Automation[]): AutomationMatcher {
  const indexed: Indexed[] = automations.map((automation) => ({
    automation,
    phrase: ` ${phraseOf(automation.title)} `,
    title: new Set(termsOf(automation.title)),
    intent: new Set(termsOf(automation.intentLabels.join(' '))),
    persona: new Set(termsOf(automation.persona)),
    tools: new Set(termsOf(automation.tools.map((tool) => tool.name).join(' '))),
  }))

  return {
    match(query, options = {}) {
      const terms = termsOf(query)
      // A query of nothing but stopwords has no signal; matching on trust
      // alone would return the whole set in trust order.
      if (terms.length === 0) return []
      const phrase = ` ${phraseOf(query)} `

      const limit = Math.min(
        Math.max(options.limit ?? AUTOMATION_MATCH.defaultLimit, 0),
        AUTOMATION_MATCH.maxLimit,
      )
      const results: AutomationMatch[] = []

      for (const entry of indexed) {
        const { automation } = entry
        if (options.niche !== undefined && automation.niche !== options.niche) continue
        if (options.kind !== undefined && automation.kind !== options.kind) continue

        const signals: AutomationMatchSignals = {
          titlePhrase: entry.phrase.includes(phrase) ? AUTOMATION_MATCH_WEIGHTS.titlePhrase : 0,
          titleTerms: AUTOMATION_MATCH_WEIGHTS.titleTerms * share(terms, entry.title),
          intentTerms: AUTOMATION_MATCH_WEIGHTS.intentTerms * share(terms, entry.intent),
          personaTerms: AUTOMATION_MATCH_WEIGHTS.personaTerms * share(terms, entry.persona),
          toolTerms: AUTOMATION_MATCH_WEIGHTS.toolTerms * share(terms, entry.tools),
          trust: 0,
        }
        const text =
          signals.titlePhrase +
          signals.titleTerms +
          signals.intentTerms +
          signals.personaTerms +
          signals.toolTerms
        // Trust breaks ties between text matches; it never makes one.
        if (text === 0) continue
        signals.trust = AUTOMATION_MATCH_WEIGHTS.trust * (automation.trustScore / 5)
        results.push({ automation, score: text + signals.trust, signals })
      }

      // Stable: equal scores keep the caller's order.
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, limit)
    },
  }
}
