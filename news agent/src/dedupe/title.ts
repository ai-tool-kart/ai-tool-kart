/*
 * Level-3 dedupe: title normalization and similarity (NEWS_AGENT.md §10).
 *
 * Three publications covering one launch must collapse into one story, or the
 * blog publishes the same news three times. Similarity is deterministic — token
 * overlap plus a bigram measure, with an entity check that catches rewordings
 * token overlap misses. No embeddings: level 4 is explicitly out of scope until
 * levels 1–3 are shown to fail on real traffic.
 */

/** Words that carry no discriminating signal in a headline. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by',
  'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that',
  'these', 'those', 'new', 'now', 'has', 'have', 'had', 'will', 'can', 'you', 'your',
  'we', 'our', 'us', 'their', 'they', 'he', 'she', 'his', 'her', 'more', 'most', 'all',
  'up', 'out', 'about', 'into', 'over', 'after', 'before', 'than', 'then', 'so', 'just',
])

/**
 * Verbs that mean "announced" and are freely interchanged between outlets.
 * Mapping them to one token is what lets "releases", "launches", "unveils" and
 * "introduces" match each other.
 */
const VERB_SYNONYMS: Record<string, string> = {
  releases: 'launch',
  release: 'launch',
  released: 'launch',
  releasing: 'launch',
  launches: 'launch',
  launch: 'launch',
  launched: 'launch',
  launching: 'launch',
  unveils: 'launch',
  unveil: 'launch',
  unveiled: 'launch',
  introduces: 'launch',
  introduce: 'launch',
  introducing: 'launch',
  introduced: 'launch',
  announces: 'launch',
  announce: 'launch',
  announced: 'launch',
  announcing: 'launch',
  debuts: 'launch',
  ships: 'launch',
  reveals: 'launch',
  revealed: 'launch',
  rolls: 'launch',
  brings: 'launch',
  adds: 'update',
  updates: 'update',
  upgrade: 'update',
  upgrades: 'update',
  officially: '',
  finally: '',
  today: '',
}

/**
 * Publisher signatures appended to feed titles. Removed before comparison so
 * "GPT-X launches | TechCrunch" and "GPT-X launches - The Verge" can match.
 */
/*
 * Whitespace on BOTH sides of the separator is required. Without it the pattern
 * eats hyphenated product names: "GPT-X officially launches" would lose
 * "-X officially launches" as a supposed masthead and normalise to "GPT".
 */
const PUBLISHER_SUFFIX = /\s+[|–—·-]\s+[A-Z][A-Za-z0-9.' ]{2,24}\s*$/

export function stripPublisherSuffix(title: string): string {
  // Only strip when what follows the separator looks like a masthead, not a
  // subtitle — a long tail after a dash is usually part of the headline.
  const match = PUBLISHER_SUFFIX.exec(title)
  if (!match) return title
  const tail = match[0].replace(/^\s*[|–—·-]\s*/, '').trim()
  if (tail.split(/\s+/).length > 3) return title
  return title.slice(0, match.index).trim()
}

/** Lowercased, de-punctuated, stop-word-free, synonym-folded token list. */
export function titleTokens(title: string): string[] {
  const base = stripPublisherSuffix(title)
    .toLowerCase()
    // Keep intra-word hyphens and dots (gpt-4, 3.5) but drop other punctuation.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens: string[] = []
  for (const raw of base.split(' ')) {
    const token = raw.replace(/^[.\-]+|[.\-]+$/g, '')
    if (!token) continue
    if (STOP_WORDS.has(token)) continue
    const mapped = VERB_SYNONYMS[token]
    if (mapped === '') continue
    tokens.push(mapped ?? token)
  }
  return tokens
}

export function normalizeTitle(title: string): string {
  return titleTokens(title).join(' ')
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const value of a) if (b.has(value)) intersection += 1
  return intersection / (a.size + b.size - intersection)
}

function bigrams(tokens: string[]): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < tokens.length - 1; i += 1) out.add(`${tokens[i]} ${tokens[i + 1]}`)
  return out
}

/**
 * Similarity in [0,1] between two headlines.
 *
 * Token Jaccard dominates; bigram overlap adds word-order evidence. Both are
 * cheap and, more importantly, explainable when a merge looks wrong in the logs.
 */
export function titleSimilarity(a: string, b: string): number {
  const tokensA = titleTokens(a)
  const tokensB = titleTokens(b)
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  const tokenScore = jaccard(setA, setB)
  const bigramScore = jaccard(bigrams(tokensA), bigrams(tokensB))

  // Containment: a short headline fully inside a longer one is the same story
  // even though Jaccard punishes the length difference.
  const smaller = setA.size <= setB.size ? setA : setB
  const larger = smaller === setA ? setB : setA
  let contained = 0
  for (const token of smaller) if (larger.has(token)) contained += 1
  const containment = contained / smaller.size

  return Math.max(tokenScore * 0.7 + bigramScore * 0.3, containment * 0.85)
}

/**
 * Distinctive entity-ish tokens: product names, version numbers, vendor names.
 * Two headlines sharing these almost certainly describe the same launch.
 */
export function distinctiveTokens(title: string): Set<string> {
  const out = new Set<string>()
  for (const token of titleTokens(title)) {
    if (token.length < 3) continue
    // Version-bearing or alphanumeric product names (gpt-5, claude4, o3).
    if (/\d/.test(token)) out.add(token)
    else if (token.length >= 5) out.add(token)
  }
  return out
}

export interface SimilarityVerdict {
  score: number
  /** Above the same-story threshold. */
  sameStory: boolean
  /** In the ambiguous band: merge, but flag for review. */
  ambiguous: boolean
  sharedEntities: string[]
}

export function compareTitles(
  a: string,
  b: string,
  thresholds: { sameStoryThreshold: number; ambiguousThreshold: number },
): SimilarityVerdict {
  const score = titleSimilarity(a, b)
  const entitiesA = distinctiveTokens(a)
  const entitiesB = distinctiveTokens(b)
  const shared = [...entitiesA].filter((token) => entitiesB.has(token))

  /*
   * Two or more shared distinctive tokens (e.g. "openai" + "gpt-5") promote a
   * near-miss into a match. NEWS_AGENT.md §10 argues this asymmetry explicitly:
   * a false merge costs one missed article, a false split costs a duplicate
   * published post.
   */
  const entityBoosted = shared.length >= 2 && score >= thresholds.ambiguousThreshold

  return {
    score,
    sameStory: score >= thresholds.sameStoryThreshold || entityBoosted,
    ambiguous:
      (score >= thresholds.ambiguousThreshold && score < thresholds.sameStoryThreshold) ||
      (entityBoosted && score < thresholds.sameStoryThreshold),
    sharedEntities: shared,
  }
}
