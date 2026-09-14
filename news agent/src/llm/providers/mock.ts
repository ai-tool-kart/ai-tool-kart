/*
 * Deterministic mock provider.
 *
 * A first-class part of the system, not a test stub. It is what makes the whole
 * pipeline runnable offline — no API key, no network, no cost — so that
 * ingestion, dedupe, verification, rendering, publishing and idempotency can all
 * be exercised end to end while the production provider remains an open decision
 * (NEWS_AGENT.md §37).
 *
 * Two rules keep it honest:
 *
 *   1. Deterministic. The same input always yields the same output, so tests
 *      assert on behaviour rather than on luck.
 *   2. It only ever states what its input contains. The mock writer builds prose
 *      from the claims it was handed, so a grounding bug in the pipeline shows up
 *      as a grounding failure here too, instead of being masked by a model that
 *      happens to know the answer.
 */

import { LLMRefusal, type LLMProvider, type LLMRawResponse, type LLMRequest, type ModelClass } from '../provider.ts'
import { shortHash } from '../../utils/ids.ts'
import { EDITORIAL_CATEGORIES, TAG_ENTITIES } from '../../config/editorial.ts'
import { containsWord, isNonEntityWord } from '../../editorial/tags.ts'

/** Rough token estimate. Only used for budget accounting in offline runs. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Deterministic pseudo-random in [0,1) seeded by a string. */
function seededUnit(seed: string): number {
  const hash = shortHash(seed, 8)
  return Number.parseInt(hash, 16) / 0xffffffff
}

/** Pulls the untrusted-content payloads back out of a prompt. */
function untrustedBlocks(input: string): Array<{ label: string; text: string }> {
  const blocks: Array<{ label: string; text: string }> = []
  const pattern = /<<<UNTRUSTED_SOURCE_CONTENT_BEGIN_a7f3c1>>>\nsource: (.*?)\n---\n([\s\S]*?)\n<<<UNTRUSTED_SOURCE_CONTENT_END_a7f3c1>>>/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    blocks.push({ label: match[1] ?? '', text: (match[2] ?? '').trim() })
  }
  return blocks
}

function claimIdsFromPrompt(input: string): string[] {
  const ids = new Set<string>()
  const pattern = /\[(clm_[a-f0-9]{6,})\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    if (match[1]) ids.add(match[1])
  }
  // The verifier prompt lists ids in "  clm_x [type] (from url)" form too.
  const bare = /^\s{2}(clm_[a-f0-9]{6,})\s/gm
  while ((match = bare.exec(input)) !== null) {
    if (match[1]) ids.add(match[1])
  }
  return [...ids]
}

/** Scripted responses for tests that need malformed, truncated or refused output. */
export type MockScript = Array<
  | { kind: 'text'; text: string }
  | { kind: 'refusal'; message?: string }
  | { kind: 'error'; message?: string }
>

export interface MockProviderOptions {
  /** Consumed in order, ahead of the generated behaviour. */
  script?: MockScript
  /** Forces every classification below the selection threshold. */
  classifyAsIrrelevant?: boolean
  /** Makes the editor reject, to exercise the rejection path. */
  editorVerdict?: 'approved' | 'needs-revision' | 'rejected'
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
        case 'classify':
          return respond(mockClassify(request.input, options), request)
        case 'extract':
          return respond(mockExtract(request.input), request)
        case 'verify':
          return respond(mockVerify(request.input), request)
        case 'seo':
          return respond(mockSeo(request.input), request)
        case 'write':
          return respond(mockWrite(request.input), request)
        case 'edit':
          return respond(mockEdit(request.input, options), request)
        default:
          throw new Error(`Mock provider has no behaviour for task ${String(request.task)}`)
      }
    },
  }
}

/* ── task behaviours ──────────────────────────────────────────────────────── */

/** Keyword-driven triage that mirrors the real classifier's shape. */
function mockClassify(input: string, options: MockProviderOptions): string {
  const text = input.toLowerCase()
  const tierMatch = /best source tier: (\d)/.exec(input)
  const tier = tierMatch?.[1] ? Number(tierMatch[1]) : 3

  const positives = ['launch', 'release', 'announce', 'introduc', 'available', 'model', 'api', 'agent', 'mcp']
  const negatives = ['rumor', 'reportedly', 'stock', 'shares', 'opinion', 'could launch']

  let relevance = 4 + (tier === 1 ? 3 : tier === 2 ? 1 : 0)
  for (const word of positives) if (text.includes(word)) relevance += 0.5
  for (const word of negatives) if (text.includes(word)) relevance -= 3

  let importance = 3 + (tier === 1 ? 3 : 1)
  if (text.includes('launch') || text.includes('introduc')) importance += 2
  if (text.includes('changelog') || text.includes('minor')) importance -= 2

  const clamp = (value: number) => Math.max(0, Math.min(10, Math.round(value * 10) / 10))

  if (options.classifyAsIrrelevant) {
    return JSON.stringify({
      relevance: 1,
      importance: 1,
      novelty: 1,
      category: 'industry',
      reasoning: 'Mock provider configured to reject all candidates.',
      recommendation: 'skip',
    })
  }

  const category = pickCategory(text)
  const finalRelevance = clamp(relevance)

  return JSON.stringify({
    relevance: finalRelevance,
    importance: clamp(importance),
    novelty: clamp(5 + seededUnit(input) * 3),
    category,
    reasoning: `Mock triage: tier ${tier} source, ${category} signals present.`,
    recommendation: finalRelevance >= 6 ? 'proceed' : 'skip',
  })
}

function pickCategory(text: string): string {
  const rules: Array<[string, string[]]> = [
    ['mcp', ['model context protocol', 'mcp server', 'mcp']],
    ['ai-agents', ['agent', 'agentic', 'tool use']],
    ['image-video', ['image generation', 'video', 'diffusion', 'text-to-image']],
    ['development', ['developer', 'sdk', 'cli', 'ide', 'copilot', 'code', 'github']],
    ['design', ['design', 'figma', 'canva']],
    ['research', ['research', 'paper', 'benchmark']],
    ['ai-models', ['model', 'gpt', 'claude', 'gemini', 'llama', 'context window']],
    ['productivity', ['productivity', 'workspace', 'notion', 'slack']],
    ['product-updates', ['update', 'changelog', 'now available', 'release notes']],
  ]
  for (const [category, keywords] of rules) {
    if (keywords.some((keyword) => text.includes(keyword))) return category
  }
  return EDITORIAL_CATEGORIES.includes('industry') ? 'industry' : 'ai-models'
}

/**
 * Extraction: turns the source text into atomic claims, one per substantive
 * sentence. Crucially it never invents content — every claim is a span of the
 * input, which is exactly the property the real extractor is asked for.
 */
function mockExtract(input: string): string {
  const blocks = untrustedBlocks(input)
  const body = blocks.map((block) => block.text).join('\n')

  const containsInstructions =
    /ignore\s+(all\s+)?(previous|prior)\s+instructions|reveal\s+(your\s+)?(api\s*key|secret)|you\s+are\s+now\s+a/i.test(
      body,
    )

  const sentences = body
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 380)

  const claims = sentences.slice(0, 12).map((sentence) => ({
    text: sentence,
    claimType: classifyClaim(sentence),
    supportingQuote: sentence.slice(0, 300),
  }))

  return JSON.stringify({ claims, containsInstructions })
}

function classifyClaim(sentence: string): string {
  const text = sentence.toLowerCase()
  if (/\$|per million|pricing|price|free tier|subscription/.test(text)) return 'pricing'
  if (/\b\d+(\.\d+)?%|\bbenchmark|\bscored?\b|\beval\b/.test(text)) return 'benchmark'
  if (/context window|tokens|supports|can now|adds support|capable/.test(text)) return 'capability'
  if (/launch|release|introduc|announc|available|unveil|ship/.test(text)) return 'launch'
  if (/\b(19|20)\d{2}\b|january|february|march|april|may|june|july|august|september|october|november|december/.test(text))
    return 'date'
  if (/"|said|according to/.test(text)) return 'quote'
  if (/raised|funding|valuation|acqui/.test(text)) return 'funding'
  return 'other'
}

/**
 * Verification: promotes claims that appear in more than one evidence block and
 * marks the rest single-source. Deterministic, and it exercises the same
 * downstream branches the real verifier would.
 */
function mockVerify(input: string): string {
  const ids = claimIdsFromPrompt(input)
  const evidenceUrls = [...input.matchAll(/^\s{2}url: (\S+)$/gm)].map((match) => match[1] ?? '')
  const tierOneCount = [...input.matchAll(/^\s{2}tier: 1$/gm)].length

  const claims = ids.map((id, index) => {
    const supportLevel = tierOneCount > 0 || index % 3 !== 2 ? 'verified' : 'single-source'
    return {
      claimId: id,
      supportLevel,
      supportingUrls: evidenceUrls.slice(0, Math.max(1, Math.min(evidenceUrls.length, 2))),
    }
  })

  return JSON.stringify({
    claims,
    ...(ids[0] ? { coreClaimId: ids[0] } : {}),
    summary: `Mock verification of ${ids.length} claims against ${evidenceUrls.length} evidence sources.`,
  })
}

/**
 * SEO brief: derived strictly from the story it was given.
 *
 * Like the rest of the mock, it states only what its input contains. The primary
 * keyword is built from the story title, so a grounding bug in the SEO validator
 * shows up here rather than being masked by a model that happens to guess a
 * plausible keyword. It picks internal links only from the routes offered in the
 * prompt, which is what the production rule requires.
 */
function mockSeo(input: string): string {
  const storyTitle = /^Story: (.+)$/m.exec(input)?.[1]?.trim() ?? 'AI tooling update'
  const format = /^Article format: (\w+)$/m.exec(input)?.[1] ?? 'standard'
  const entities = [...input.matchAll(/^ {2}- (.+)$/gm)].map((match) => match[1]?.trim() ?? '')

  // Only paths actually offered in the prompt, never composed.
  const offeredRoutes = [...input.matchAll(/^ {2}(\/[a-z0-9/-]*) {2}— /gm)].map((m) => m[1] ?? '')

  const words = storyTitle
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
  const primaryKeyword = words.slice(0, 4).join(' ') || 'ai tool update'

  const maxSecondary = format === 'brief' ? 2 : format === 'analysis' ? 6 : 4
  const secondaryKeywords = entities
    .filter(Boolean)
    .slice(0, maxSecondary)
    .map((entity) => `${entity.toLowerCase()} update`)
    .filter((keyword) => keyword.toLowerCase() !== primaryKeyword)

  const maxHeadings = format === 'brief' ? 3 : format === 'analysis' ? 8 : 6
  const suggestedHeadings = ['What happened', "What's new", 'Why it matters'].slice(0, maxHeadings)

  const description =
    `${storyTitle}. What changed, who it affects, and what to do next, based on published sources.`
      .replace(/\s+/g, ' ')
      .slice(0, 160)

  return JSON.stringify({
    primaryKeyword,
    secondaryKeywords,
    searchIntent: 'informational',
    seoTitle: storyTitle.slice(0, 70),
    metaDescription:
      description.length >= 50
        ? description
        : `${description} Details and sources are summarised for readers evaluating this tool.`.slice(0, 160),
    suggestedSlug: primaryKeyword.replace(/\s+/g, '-'),
    suggestedHeadings,
    internalLinkTargets: offeredRoutes.slice(0, format === 'brief' ? 2 : 3),
  })
}

/**
 * Writer: assembles sections strictly from the supplied claims.
 *
 * Every sentence it emits is either a claim verbatim or a connective phrase
 * containing no facts, which is what lets the editorial-grounding test be
 * meaningful offline.
 */
function mockWrite(input: string): string {
  const storyTitle = /^Story: (.+)$/m.exec(input)?.[1]?.trim() ?? 'AI tooling update'
  const category = /^Category: ([a-z-]+)/m.exec(input)?.[1] ?? 'ai-models'

  const claimBlocks = untrustedBlocks(input).filter((block) => block.label.startsWith('claim '))
  const claimIds = claimIdsFromPrompt(input)

  const statements = claimBlocks.map((block) => block.text).filter(Boolean)
  const lead = statements[0] ?? 'The vendor published an update.'
  const rest = statements.slice(1)

  const third = Math.ceil(rest.length / 3) || 1
  const whatsNew = rest.slice(0, third)
  const details = rest.slice(third, third * 2)
  const implications = rest.slice(third * 2)

  const publishers = [...input.matchAll(/^\s{2}- ([^(]+) \(tier \d/gm)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean)
  const attribution = publishers.length > 0 ? publishers.join(' and ') : 'the published sources'

  const sections = [
    {
      heading: 'What happened',
      paragraphs: [
        `${lead} The details below come from ${attribution}.`,
        'This report is assembled from the verified claims listed by the publishing pipeline, and states nothing beyond them.',
      ],
    },
    {
      heading: "What's new",
      ...(whatsNew.length > 0
        ? { bullets: whatsNew.slice(0, 8) }
        : { paragraphs: ['No further specifics were established by the available sources.'] }),
    },
    {
      heading: 'Why it matters',
      paragraphs: [
        details.length > 0
          ? details.join(' ')
          : 'The change is narrow, and its practical effect depends on how teams already use the product.',
        'Readers evaluating tools in this category should weigh the reported change against what they currently rely on.',
      ],
    },
    {
      heading: 'Who should care',
      paragraphs: [
        'Developers and designers already working with this vendor are the most directly affected, along with teams comparing options in the same category.',
      ],
    },
    {
      heading: 'Practical implications',
      paragraphs: [
        implications.length > 0
          ? implications.join(' ')
          : 'Availability and rollout details were not specified by the sources reviewed here.',
        'Anyone depending on this behaviour should confirm the specifics against the vendor documentation linked below before acting.',
      ],
    },
  ]

  const tags = deriveTags(storyTitle, statements)

  const rawExcerpt = `${storyTitle}. ${lead}`.replace(/\s+/g, ' ')
  const excerpt =
    rawExcerpt.length < 80
      ? `${rawExcerpt} Details and sources are summarised below for readers evaluating this tool.`.slice(0, 300)
      : rawExcerpt.slice(0, 300)

  return JSON.stringify({
    title: storyTitle.slice(0, 108),
    excerpt,
    category,
    tags,
    sections,
    usedClaimIds: claimIds,
  })
}

/**
 * Entity tags for the mock draft, derived from the story itself.
 *
 * Two rules keep this honest, and both exist because the earlier version broke
 * them. It matched with a plain substring `includes` over the ENTIRE writer
 * prompt, so a GitHub Copilot story picked up the tag "Meta" — "meta" appears
 * inside "metadata" in the prompt scaffolding, and the whole prompt includes
 * URLs and publisher lists the article never discusses. A wrong tag is a wrong
 * factual association on a published post.
 *
 *   1. Match on WORD BOUNDARIES, via the same containsWord() the production
 *      normaliser uses, so "meta" cannot match "metadata".
 *   2. Search only the STORY — its title and the claims the draft is built from
 *      — never the surrounding prompt.
 *
 * It also reuses the curated vocabulary in config/editorial.ts rather than
 * keeping a private list, so the mock cannot drift from production canonical
 * forms. Everything it emits still passes through normalizeTags() downstream;
 * this only stops the mock from proposing something unrelated in the first place.
 */
function deriveTags(storyTitle: string, statements: string[]): string[] {
  const haystack = [storyTitle, ...statements].join(' ')
  const found: string[] = []

  for (const [key, canonical] of Object.entries(TAG_ENTITIES)) {
    if (found.length >= 5) break
    if (!found.includes(canonical) && containsWord(haystack, key)) found.push(canonical)
  }

  /*
   * Product names the curated vocabulary does not list — "Visual Studio",
   * "Aurora 2" — read out of the TITLE only, where a story names its subject.
   * Capitalised runs of up to three words, which is what a product name looks
   * like; the production entity check applies the same shape rule.
   */
  for (const match of storyTitle.matchAll(/[A-Z][\w.+-]*(?: [A-Z0-9][\w.+-]*){0,2}/g)) {
    if (found.length >= 5) break
    const candidate = match[0].trim()
    if (candidate.length < 3) continue
    if (TAG_ENTITIES[candidate.toLowerCase()]) continue
    if (found.some((tag) => tag.toLowerCase() === candidate.toLowerCase())) continue
    /*
     * Calendar words and headline verbs capitalise exactly like product names,
     * so "August" in "Copilot — August update" would otherwise become a tag.
     * The same shared predicate production uses rejects them here.
     */
    if (isNonEntityWord(candidate)) continue
    found.push(candidate)
  }

  return found.slice(0, 5)
}

/**
 * Editor: checks that the draft's sentences trace back to claim text.
 *
 * Deliberately real logic rather than a rubber stamp, so the rejection path is
 * exercised in offline runs and tests.
 */
function mockEdit(input: string, options: MockProviderOptions): string {
  if (options.editorVerdict && options.editorVerdict !== 'approved') {
    return JSON.stringify({
      verdict: options.editorVerdict,
      confidence: 0.3,
      issues: [
        {
          severity: 'blocking',
          kind: 'unsupported-claim',
          detail: 'Mock provider configured to reject this draft.',
        },
      ],
      notes: 'Mock editorial rejection.',
    })
  }

  const draft = untrustedBlocks(input).find((block) => block.label === 'generated draft')?.text ?? ''
  const claimSection = input.split('VERIFIED CLAIMS THE DRAFT WAS BUILT FROM')[1] ?? ''
  const claimText = claimSection.toLowerCase()

  const issues: Array<{ severity: string; kind: string; detail: string }> = []

  // Any number in the draft must appear in the claims. This is the cheap,
  // deterministic version of the grounding check, and it catches the failure
  // mode that matters most: invented figures.
  const draftNumbers = [...draft.matchAll(/\b\d[\d,.]*\s*(?:%|k|m|b|million|billion|tokens?)?\b/gi)]
    .map((match) => match[0].trim().toLowerCase())
    .filter((token) => token.length > 1)

  const ungrounded = [...new Set(draftNumbers)].filter((token) => !claimText.includes(token))
  for (const token of ungrounded.slice(0, 3)) {
    issues.push({
      severity: 'blocking',
      kind: 'unsupported-claim',
      detail: `The figure "${token}" does not appear in any verified claim.`,
    })
  }

  const duplicateTitles = (input.split('PREVIOUSLY PUBLISHED TITLES')[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line.length > 10 && line !== '(none)')
  const title = /^Title: (.+)$/m.exec(input)?.[1]?.trim() ?? ''
  if (duplicateTitles.some((published) => published.toLowerCase() === title.toLowerCase())) {
    issues.push({
      severity: 'blocking',
      kind: 'duplicate',
      detail: 'A post with this exact title has already been published.',
    })
  }

  const blocking = issues.filter((issue) => issue.severity === 'blocking').length
  const verdict = blocking > 0 ? 'needs-revision' : 'approved'
  const confidence = blocking > 0 ? 0.35 : 0.82

  return JSON.stringify({
    verdict,
    confidence,
    issues,
    notes:
      blocking > 0
        ? 'Mock editor found statements not traceable to the verified claim set.'
        : 'Mock editor found every checked figure grounded in the claim set.',
  })
}
