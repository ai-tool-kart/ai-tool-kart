/*
 * Tag vocabulary, normalisation and validation (NEWS_AGENT.md §20).
 *
 * ── Why tags live apart from categories ──────────────────────────────────────
 *
 * Categories are a CONTROLLED EDITORIAL TAXONOMY: a fixed allowlist in
 * config/editorial.ts, ten terms, changed by an operator. Tags are an OPEN-ENDED
 * ENTITY VOCABULARY: the writer names whichever products and companies a story
 * is actually about, and that set grows with the industry. The two must never be
 * handled by the same rules — see the header of wordpress/taxonomy.ts for how
 * that asymmetry is enforced at the WordPress boundary.
 *
 * ── Why validation lives here rather than at the WordPress call ──────────────
 *
 * A tag is a model-authored string that becomes a permanent public taxonomy term
 * in a CMS. §28's rule that untrusted text never reaches a privileged operation
 * unvalidated applies to it exactly as it applies to prompt content. So every
 * tag passes through one function, here, before anything downstream can look it
 * up or create it: length, character class, markup, control characters and
 * theme-vs-entity shape are all decided in this module and nowhere else.
 *
 * Normalisation is deliberately conservative. "Open AI", "openai" and "OpenAI"
 * collapse because the curated vocabulary says they are the same product. Two
 * genuinely different products with similar names never collapse, because there
 * is no fuzzy matching anywhere in this file — only exact lookups against a
 * hand-written map, and exact word-boundary containment against the article.
 */

import { ARTICLE } from '../config/limits.ts'
import { EDITORIAL_SCOPE } from '../config/editorial.ts'
import { slugify } from '../generation/slug.ts'

/**
 * Words that look like tags but are themes, not entities (§20 forbids these).
 * Checked before the proper-noun fallback, which would otherwise let them in.
 */
const NON_ENTITY_TAGS = new Set([
  'ai', 'artificial intelligence', 'machine learning', 'llm', 'llms', 'technology',
  'news', 'update', 'updates', 'launch', 'release', 'model', 'models', 'tools',
  'ai tools', 'software', 'startup', 'innovation', 'future', 'productivity',
  'the', 'new', 'best', 'top', 'guide', 'api', 'apis',
  // Calendar words. A headline like "GitHub Copilot — August update" is about a
  // product, never about a month; "August" is capitalised phrasing, not an entity.
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  // Headline verbs and section words that survive capitalisation at the start of
  // a title. §20: never generate tags from article phrasing.
  'introducing', 'announcing', 'launches', 'launching', 'releases', 'releasing',
  'preview', 'beta', 'changelog', 'docs', 'documentation', 'report', 'roundup',
  'today', 'week', 'general availability', 'now available',
])

/** True when a candidate is phrasing or a theme rather than a named entity. */
export function isNonEntityWord(value: string): boolean {
  return NON_ENTITY_TAGS.has(value.trim().toLowerCase())
}

/** Longest a tag may be. Anything longer is a sentence, not an entity. */
const MAX_TAG_CHARS = 40
const MIN_TAG_CHARS = 2
/** An entity name is at most a few words: "Hugging Face", "GitHub Copilot". */
const MAX_TAG_WORDS = 3

/** C0 and C1 control characters, including the DEL range. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/

export type TagRejection =
  | 'empty'
  | 'too-short'
  | 'too-long'
  | 'too-many-words'
  | 'control-characters'
  | 'markup'
  | 'disallowed-characters'
  | 'theme-not-entity'
  | 'unslugifiable'

export type TagCheck = { ok: true; tag: string } | { ok: false; reason: TagRejection }

/**
 * Strips presentation noise without changing which entity is named.
 *
 * Whitespace collapse and surrounding-punctuation removal only. Internal
 * punctuation is preserved, because it distinguishes real products: "GPT-4" is
 * not "GPT4", and "Node.js" is not "Nodejs".
 */
function tidy(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`([{<,.;:!?-]+/, '')
    .replace(/[\s"'`)\]}>,.;:!?-]+$/, '')
    .trim()
}

/**
 * Validates one model-proposed tag as safe to look up or create in WordPress.
 *
 * This is the single gate §9 asks for: no string reaches findTerm/createTerm
 * without passing through it.
 */
export function checkTag(raw: string): TagCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' }

  // Control characters are checked BEFORE tidying: tidy() would otherwise
  // collapse an embedded newline into a space and hide the anomaly.
  if (CONTROL_CHARACTERS.test(raw)) return { ok: false, reason: 'control-characters' }
  if (/[<>]|&[a-z]+;|&#\d+;/i.test(raw)) return { ok: false, reason: 'markup' }

  const tag = tidy(raw)
  if (tag.length === 0) return { ok: false, reason: 'empty' }
  if (tag.length < MIN_TAG_CHARS) return { ok: false, reason: 'too-short' }
  if (tag.length > MAX_TAG_CHARS) return { ok: false, reason: 'too-long' }
  if (tag.split(' ').length > MAX_TAG_WORDS) return { ok: false, reason: 'too-many-words' }

  // Letters, digits, spaces and the punctuation real product names contain.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .+#'&/-]*$/u.test(tag)) {
    return { ok: false, reason: 'disallowed-characters' }
  }
  if (NON_ENTITY_TAGS.has(tag.toLowerCase())) return { ok: false, reason: 'theme-not-entity' }

  // A term whose slug is empty cannot be addressed in WordPress at all.
  // slugify() substitutes a placeholder rather than returning '', so both the
  // empty case and the placeholder are rejected here.
  const slug = slugify(tag)
  if (!slug || slug === 'ai-tool-kart-news') return { ok: false, reason: 'unslugifiable' }

  return { ok: true, tag }
}

/**
 * Maps a proposal onto its canonical display form when the curated vocabulary
 * recognises it, so "open ai" and "OpenAI" address one WordPress term.
 */
export function canonicalTag(raw: string): string | undefined {
  const checked = checkTag(raw)
  if (!checked.ok) return undefined
  return EDITORIAL_SCOPE.tagEntities[checked.tag.toLowerCase()] ?? checked.tag
}

/** The WordPress term slug a tag resolves to. Two names sharing one slug are one term. */
export function tagSlug(tag: string): string {
  return slugify(tag)
}

/** Whole-word (or whole-phrase) containment, so "meta" never matches "metadata". */
export function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(haystack)
}

/**
 * Accepts a model-proposed tag that is not in the curated vocabulary.
 *
 * The curated list cannot name every vendor, and treating it as exhaustive made
 * the tag floor unsatisfiable for any company not on it — which blocked
 * publication permanently, since no amount of rewriting can invent a vocabulary
 * entry. So an unknown tag is accepted only if it behaves like a proper noun the
 * article actually discusses: capitalised, short, not a theme word, and present
 * in the text. That keeps §20's "entities, not themes" rule without making it a
 * trap.
 */
function looksLikeEntity(tag: string, haystack: string): boolean {
  const words = tag.split(' ')
  // Proper nouns and product names: initial capital, or internal capitals/digits
  // as in "OpenAI", "GPT-4", "Aurora 2".
  if (!words.every((word) => /^[\p{Lu}\p{N}][\p{L}\p{N}.+#'&/-]*$/u.test(word))) return false
  return containsWord(haystack, tag)
}

/**
 * Normalises model-proposed tags into validated, deduplicated entity tags.
 *
 * Every accepted tag must be named in the article. That applies to curated
 * vocabulary hits too, not just to unknown proposals: a model that offers "Meta"
 * for a story that never mentions Meta would otherwise get a canonical term for
 * free, and a wrong tag is a wrong factual association on a published post.
 *
 * Deduplication is by SLUG, because the slug is what WordPress keys the term on
 * — so "OpenAI" and "openai" cannot become two rows in the same taxonomy.
 */
export function normalizeTags(proposed: string[], fallbackText: string): string[] {
  const vocabulary = EDITORIAL_SCOPE.tagEntities
  const bySlug = new Map<string, string>()

  const accept = (tag: string): void => {
    const slug = tagSlug(tag)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, tag)
  }

  // Pass 1: curated vocabulary, but only for entities the article discusses.
  for (const raw of proposed) {
    if (bySlug.size >= ARTICLE.maxTags) break
    const checked = checkTag(raw)
    if (!checked.ok) continue
    const canonical = vocabulary[checked.tag.toLowerCase()]
    if (!canonical) continue
    if (containsWord(fallbackText, checked.tag) || containsWord(fallbackText, canonical)) {
      accept(canonical)
    }
  }

  // Pass 2: unknown proposals that behave like proper nouns in the text.
  for (const raw of proposed) {
    if (bySlug.size >= ARTICLE.maxTags) break
    const checked = checkTag(raw)
    if (!checked.ok) continue
    if (vocabulary[checked.tag.toLowerCase()]) continue
    if (looksLikeEntity(checked.tag, fallbackText)) accept(checked.tag)
  }

  // Pass 3: backfill from the article text when too few valid tags survived.
  if (bySlug.size < ARTICLE.minTags) {
    for (const [key, canonical] of Object.entries(vocabulary)) {
      if (bySlug.size >= ARTICLE.maxTags) break
      if (containsWord(fallbackText, key)) accept(canonical)
    }
  }

  return [...bySlug.values()].slice(0, ARTICLE.maxTags)
}

/**
 * Entity names a story is actually about, for the SEO brief.
 *
 * Reuses normalizeTags rather than keeping a second extraction path, so the
 * entities SEO reasons about are exactly the ones the tag layer would accept.
 * That matters: the "Meta" false positive came from a second, looser matcher
 * drifting from the production one, and one such matcher is enough.
 */
export function deriveEntityHints(storyTitle: string, claims: Array<{ text: string }>): string[] {
  const corpus = [storyTitle, ...claims.map((claim) => claim.text)].join(' ')
  return normalizeTags([], corpus)
}
