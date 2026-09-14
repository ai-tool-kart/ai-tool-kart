/*
 * SEO layer.
 *
 * The governing rule, and what nearly every test here is really checking:
 *
 *     SEO shapes structure and wording. SEO does not invent facts.
 *
 * The prompt asks for that; this suite proves the code enforces it, because a
 * prompt is not a guarantee. The highest-risk failure is a headline or keyword
 * that asserts something the verified claims never established — a superlative,
 * a comparison, a ranking — so those are checked hardest.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeSeoIntoVerdict, validateSeo } from '../src/seo/validate.ts'
import { buildLinkRegistry, retainKnownRoutes, STATIC_ROUTES } from '../src/seo/routes.ts'
import { buildSeoBrief } from '../src/seo/brief.ts'
import { createBudget } from '../src/llm/budget.ts'
import { createLLMClient } from '../src/llm/client.ts'
import { createMockProvider } from '../src/llm/providers/mock.ts'
import { SeoBriefSchema } from '../src/llm/schemas.ts'
import { slugify } from '../src/generation/slug.ts'
import type { ArticleFormat } from '../src/config/limits.ts'
import type { Claim, SeoBrief, SourceEvidence } from '../src/domain/types.ts'
import { testLogger } from './helpers.ts'

const STORY_TITLE = 'GitHub deprecates MAI-Code-1-Flash across Copilot experiences'

function claims(texts: string[]): Claim[] {
  return texts.map((text, index) => ({
    id: `clm_${index}`,
    text,
    claimType: 'capability',
    supportLevel: 'verified',
    evidenceUrls: ['https://github.blog/changelog/x'],
  }))
}

const CLAIMS = claims([
  'GitHub deprecated MAI-Code-1-Flash across GitHub Copilot experiences on September 10, 2026.',
  'GitHub recommends MAI-Code-1.1-Flash as the alternative to MAI-Code-1-Flash.',
  'The change covers Copilot Chat, inline edits, ask and agent modes, and code completions.',
])

function brief(overrides: Partial<SeoBrief> = {}): SeoBrief {
  return {
    primaryKeyword: 'mai-code-1-flash deprecation',
    secondaryKeywords: ['github copilot model deprecation'],
    searchIntent: 'informational',
    seoTitle: 'GitHub deprecates MAI-Code-1-Flash in Copilot',
    metaDescription:
      'GitHub deprecated MAI-Code-1-Flash across Copilot on September 10, 2026 and recommends MAI-Code-1.1-Flash instead.',
    suggestedSlug: 'github-deprecates-mai-code-1-flash',
    suggestedHeadings: ['What happened', 'What to use instead'],
    internalLinkTargets: ['/browse'],
    ...overrides,
  }
}

function validate(seo: SeoBrief, format: ArticleFormat = 'brief', overrides: Partial<Parameters<typeof validateSeo>[0]> = {}) {
  return validateSeo({
    seo,
    title: STORY_TITLE,
    excerpt: 'GitHub deprecated MAI-Code-1-Flash across Copilot experiences.',
    headings: ['What happened', 'What to use instead'],
    bodyText:
      'GitHub deprecated MAI-Code-1-Flash across Copilot experiences on September 10, 2026. ' +
      'GitHub recommends MAI-Code-1.1-Flash as the alternative.',
    format,
    claims: CLAIMS,
    storyTitle: STORY_TITLE,
    ...overrides,
  })
}

/* ── the happy path ───────────────────────────────────────────────────────── */

test('a grounded SEO brief passes with no blocking issues', () => {
  const result = validate(brief())
  assert.deepEqual(result.blocking, [], `unexpected blocking: ${result.blocking.join('; ')}`)
})

test('the SEO brief schema accepts a well-formed brief and rejects extras', () => {
  const parsed = SeoBriefSchema.safeParse({
    primaryKeyword: 'mai-code-1-flash deprecation',
    secondaryKeywords: ['github copilot deprecation'],
    searchIntent: 'informational',
    seoTitle: 'GitHub deprecates MAI-Code-1-Flash in Copilot',
    metaDescription: 'x'.repeat(120),
    suggestedSlug: 'github-deprecates-mai-code-1-flash',
    suggestedHeadings: ['What happened'],
    internalLinkTargets: ['/browse'],
  })
  assert.equal(parsed.success, true)

  // .strict(): an extra field means the model went off-contract.
  const extra = SeoBriefSchema.safeParse({
    primaryKeyword: 'x', secondaryKeywords: [], searchIntent: 'informational',
    seoTitle: 'A factual title here', metaDescription: 'x'.repeat(120),
    suggestedSlug: 'abc', suggestedHeadings: [], internalLinkTargets: [],
    canonicalUrl: 'https://evil.test',
  })
  assert.equal(extra.success, false)
})

/* ── facts: the rules that matter ─────────────────────────────────────────── */

test('a keyword unrelated to the story is blocking', () => {
  const result = validate(brief({ primaryKeyword: 'cheap crypto mining rigs 2026' }))
  assert.ok(
    result.blocking.some((issue) => issue.includes('seo-ungrounded-keyword')),
    `expected an ungrounded-keyword block, got: ${result.blocking.join('; ')}`,
  )
})

test('unsupported superlatives are blocking wherever they appear', async (t) => {
  const cases: Array<[string, Partial<SeoBrief>]> = [
    ['in the SEO title', { seoTitle: 'The best AI coding assistant for MAI-Code-1-Flash users' }],
    ['in the meta description', {
      metaDescription:
        'GitHub deprecated MAI-Code-1-Flash. Switch to the fastest and most powerful Copilot model available today.',
    }],
    ['in the primary keyword', { primaryKeyword: 'best copilot model deprecation' }],
    ['in a secondary keyword', { secondaryKeywords: ['cheapest github copilot alternative'] }],
  ]

  for (const [label, override] of cases) {
    await t.test(label, () => {
      const result = validate(brief(override))
      assert.ok(
        result.blocking.some((issue) => issue.includes('seo-unsupported-superlative')),
        `expected a superlative block for ${label}, got: ${result.blocking.join('; ')}`,
      )
    })
  }
})

test('a superlative the source itself used is permitted', () => {
  // The rule is "not supported by evidence", not "never say the word".
  const sourced = claims([
    'GitHub said MAI-Code-1.1-Flash is the fastest model available in Copilot.',
    'GitHub deprecated MAI-Code-1-Flash across Copilot experiences.',
  ])
  const result = validateSeo({
    seo: brief({ seoTitle: 'GitHub calls MAI-Code-1.1-Flash its fastest Copilot model' }),
    title: STORY_TITLE,
    excerpt: 'x',
    headings: ['What happened'],
    bodyText: 'GitHub deprecated MAI-Code-1-Flash.',
    format: 'brief',
    claims: sourced,
    storyTitle: STORY_TITLE,
  })
  assert.deepEqual(
    result.blocking.filter((issue) => issue.includes('superlative')),
    [],
    'a superlative present in a verified claim must not be blocked',
  )
})

test('a misleading SEO title is blocking', () => {
  const result = validate(brief({ seoTitle: 'Anthropic launches a new pricing tier for Claude' }))
  assert.ok(result.blocking.some((issue) => issue.includes('seo-misleading-title')))
})

test('keyword stuffing is caught', async (t) => {
  await t.test('repeated across title, headings and meta', () => {
    const keyword = 'mai-code-1-flash deprecation'
    const result = validate(brief({ primaryKeyword: keyword }), 'brief', {
      title: `${keyword} — ${keyword}`,
      headings: [`${keyword}`, `${keyword} details`, `more ${keyword}`],
      // seoTitle and metaDescription add further repeats.
    })
    assert.ok(
      result.blocking.some((issue) => issue.includes('seo-keyword-stuffing')),
      `expected stuffing block, got: ${result.blocking.join('; ')}`,
    )
  })

  await t.test('a secondary keyword that duplicates the primary', () => {
    const result = validate(
      brief({ primaryKeyword: 'mai-code-1-flash deprecation', secondaryKeywords: ['MAI-Code-1-Flash Deprecation'] }),
    )
    assert.ok(result.blocking.some((issue) => issue.includes('seo-keyword-stuffing')))
  })
})

test('missing required metadata is blocking', async (t) => {
  await t.test('meta description', () => {
    assert.ok(validate(brief({ metaDescription: '   ' })).blocking.some((i) => i.includes('missing-meta-description')))
  })
  await t.test('primary keyword', () => {
    assert.ok(validate(brief({ primaryKeyword: '  ' })).blocking.some((i) => i.includes('missing-primary-keyword')))
  })
})

test('a slug that cannot normalise is blocking', () => {
  const result = validate(brief({ suggestedSlug: '!!! ??? ***' }))
  assert.ok(result.blocking.some((issue) => issue.includes('seo-malformed-slug')))
})

test('slug normalisation is deterministic and URL-safe', async (t) => {
  const cases: Array<[string, string]> = [
    ['GitHub Deprecates MAI-Code-1-Flash', 'github-deprecates-mai-code-1-flash'],
    ['  spaced   out  ', 'spaced-out'],
    ['Ünïcödé Títlé', 'unicode-title'],
    ['GPT-4.5 & Claude', 'gpt-4-5-and-claude'],
    ['slashes/and?queries=1', 'slashes-and-queries-1'],
  ]
  for (const [input, expected] of cases) {
    await t.test(input.trim(), () => {
      assert.equal(slugify(input), expected)
      assert.match(slugify(input), /^[a-z0-9-]+$/, 'a slug must be URL-safe')
    })
  }
})

/* ── advisory vs blocking ─────────────────────────────────────────────────── */

test('imperfect but honest SEO is advisory, never blocking', () => {
  const result = validate(
    brief({
      metaDescription: 'GitHub deprecated MAI-Code-1-Flash across Copilot on 10 September 2026.',
      seoTitle:
        'GitHub deprecates MAI-Code-1-Flash across every Copilot surface including chat and completions',
    }),
  )
  assert.deepEqual(result.blocking, [], 'a long title is not a reason to block a true article')
  assert.ok(result.advisory.some((issue) => issue.includes('seo-title-long')))
})

test('weak keyword placement is advisory only', () => {
  const result = validate(brief(), 'standard', {
    title: 'An unrelated headline about something else entirely',
    headings: ['Background', 'Context'],
    bodyText: 'Nothing relevant appears in this opening paragraph at all.',
  })
  assert.ok(result.advisory.some((issue) => issue.includes('seo-keyword-not-in-title')))
  assert.ok(result.advisory.some((issue) => issue.includes('seo-keyword-not-in-heading')))
  assert.deepEqual(
    result.blocking.filter((issue) => issue.includes('not-in')),
    [],
    'placement problems must never block',
  )
})

/* ── format awareness ─────────────────────────────────────────────────────── */

test('SEO shape is proportionate to the article format', async (t) => {
  const many = brief({
    suggestedHeadings: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'],
    secondaryKeywords: ['a github copilot', 'b github copilot', 'c github copilot', 'd github copilot', 'e github copilot'],
  })

  await t.test('brief flags an inflated structure', () => {
    const result = validate(many, 'brief')
    assert.ok(result.advisory.some((issue) => issue.includes('seo-too-many-headings')))
    assert.ok(result.advisory.some((issue) => issue.includes('seo-too-many-secondary-keywords')))
  })

  await t.test('analysis accepts the same structure', () => {
    const result = validate(many, 'analysis')
    assert.ok(!result.advisory.some((issue) => issue.includes('seo-too-many-headings')))
  })

  await t.test('a brief is not asked for a keyword heading', () => {
    const result = validate(brief(), 'brief', { headings: ['Background'] })
    assert.ok(
      !result.advisory.some((issue) => issue.includes('seo-keyword-not-in-heading')),
      'a 3-section brief should not be nagged about heading keywords',
    )
  })
})

test('commercial intent on a brief is flagged for review', () => {
  const result = validate(brief({ searchIntent: 'commercial' }), 'brief')
  assert.ok(result.advisory.some((issue) => issue.includes('seo-intent-mismatch')))
})

/* ── internal links: never invented ───────────────────────────────────────── */

test('internal link suggestions that name no known route are dropped', () => {
  const registry = buildLinkRegistry()
  const { kept, dropped } = retainKnownRoutes(
    ['/browse', '/tools/github-copilot', 'https://example.com/spam', '/blog/made-up-article'],
    registry,
    4,
  )
  assert.deepEqual(kept, ['/browse'])
  assert.equal(dropped.length, 3, 'every unknown target must be dropped, not rendered')
})

test('only articles this agent actually published become blog link targets', () => {
  const registry = buildLinkRegistry({
    publishedSlugs: [{ slug: 'real-article', title: 'A real article' }],
  })
  const { kept, dropped } = retainKnownRoutes(['/blog/real-article', '/blog/invented'], registry, 4)
  assert.deepEqual(kept, ['/blog/real-article'])
  assert.deepEqual(dropped, ['/blog/invented'])
})

test('the static route registry matches the React router', () => {
  /*
   * Guard against drift. These paths are transcribed from client/src/App.tsx
   * because the agent cannot import frontend source; if a route is renamed there
   * and not here, this list starts producing 404s.
   */
  assert.deepEqual(
    STATIC_ROUTES.map((route) => route.path).sort(),
    ['/blog', '/browse', '/compare', '/new-launches', '/workflows'],
  )
  for (const route of STATIC_ROUTES) {
    assert.match(route.path, /^\/[a-z-]+$/, 'a registry path must be a clean absolute route')
    assert.ok(route.description.length > 0, 'each route needs a description for the model to choose on')
  }
})

test('the link registry caps suggestions at the format limit', () => {
  const registry = buildLinkRegistry()
  const { kept } = retainKnownRoutes(['/browse', '/workflows', '/compare', '/blog'], registry, 2)
  assert.equal(kept.length, 2)
})

/* ── SEO can never override the factual verdict ───────────────────────────── */

test('SEO validation cannot rescue a draft the factual editor rejected', async (t) => {
  await t.test('rejected stays rejected with clean SEO', () => {
    assert.equal(mergeSeoIntoVerdict('rejected', []), 'rejected')
  })
  await t.test('needs-revision stays needs-revision with clean SEO', () => {
    assert.equal(mergeSeoIntoVerdict('needs-revision', []), 'needs-revision')
  })
  await t.test('approved can be lowered by an SEO block', () => {
    assert.equal(mergeSeoIntoVerdict('approved', ['seo-misleading-title: ...']), 'needs-revision')
  })
  await t.test('approved survives clean SEO', () => {
    assert.equal(mergeSeoIntoVerdict('approved', []), 'approved')
  })
})

/* ── brief production through the real client ─────────────────────────────── */

function seoClient() {
  const budget = createBudget({ maxLlmCallsPerRun: 10, maxTokensPerRun: 200_000 })
  return {
    budget,
    llm: createLLMClient({ provider: createMockProvider(), budget, logger: testLogger() }),
  }
}

const EVIDENCE: SourceEvidence[] = [
  {
    id: 'ev_1',
    storyId: 'sty_1',
    url: 'https://github.blog/changelog/x',
    publisher: 'GitHub',
    title: 'MAI-Code-1-Flash deprecated',
    trustTier: 1,
    sourceType: 'release-notes',
    cleanedText: 'text',
    extractedFacts: [],
    retrievedAt: '2026-09-14T00:00:00.000Z',
    contentHash: 'h1',
  },
]

test('a brief is produced, normalised, and grounded', async () => {
  const { llm } = seoClient()
  const result = await buildSeoBrief(
    {
      storyTitle: STORY_TITLE,
      category: 'development',
      format: 'brief',
      claims: CLAIMS,
      evidence: EVIDENCE,
      entities: ['GitHub', 'GitHub Copilot'],
    },
    { llm, logger: testLogger() },
  )

  assert.ok(result, 'a brief should be produced')
  assert.ok(result.primaryKeyword.length > 0)
  assert.match(result.suggestedSlug, /^[a-z0-9-]+$/, 'the slug must be normalised by application code')
  assert.ok(result.model?.startsWith('mock:'), 'the producing model is recorded')
  for (const target of result.internalLinkTargets) {
    assert.ok(
      STATIC_ROUTES.some((route) => route.path === target),
      `internal link ${target} must come from the registry`,
    )
  }
})

test('a brief with no verified claims is skipped rather than guessed', async () => {
  const { llm, budget } = seoClient()
  const unverified: Claim[] = CLAIMS.map((claim) => ({ ...claim, supportLevel: 'single-source' }))
  const result = await buildSeoBrief(
    {
      storyTitle: STORY_TITLE,
      category: 'development',
      format: 'brief',
      claims: unverified,
      evidence: EVIDENCE,
      entities: [],
    },
    { llm, logger: testLogger() },
  )
  assert.equal(result, undefined, 'SEO must not be grounded on unverified material')
  assert.equal(budget.usage.calls, 0, 'and must not spend a call doing it')
})

test('an SEO failure degrades to no brief rather than losing the article', async () => {
  const budget = createBudget({ maxLlmCallsPerRun: 10, maxTokensPerRun: 200_000 })
  const llm = createLLMClient({
    provider: createMockProvider({
      script: [
        { kind: 'error', message: 'provider down' },
        { kind: 'error', message: 'provider down' },
        { kind: 'error', message: 'provider down' },
      ],
    }),
    budget,
    logger: testLogger(),
  })

  const result = await buildSeoBrief(
    {
      storyTitle: STORY_TITLE,
      category: 'development',
      format: 'brief',
      claims: CLAIMS,
      evidence: EVIDENCE,
      entities: [],
    },
    { llm, logger: testLogger() },
  )
  assert.equal(result, undefined, 'a failed brief must not throw — the article is still publishable')
})

test('the format caps what the brief may ask for', async () => {
  const { llm } = seoClient()
  const forBrief = await buildSeoBrief(
    { storyTitle: STORY_TITLE, category: 'development', format: 'brief', claims: CLAIMS, evidence: EVIDENCE, entities: ['GitHub', 'GitHub Copilot', 'Visual Studio', 'OpenAI'] },
    { llm, logger: testLogger() },
  )
  assert.ok(forBrief)
  assert.ok(forBrief.suggestedHeadings.length <= 3, 'a brief gets at most 3 headings')
  assert.ok(forBrief.secondaryKeywords.length <= 2, 'a brief gets at most 2 secondary keywords')
  assert.ok(forBrief.internalLinkTargets.length <= 2)
})

/* ── the writer stays grounded when SEO is present ────────────────────────── */

test('an SEO brief cannot make the writer state something unverified', async () => {
  /*
   * The whole SEO layer rests on this. The prompt subordinates search guidance
   * to the claims, but the structural guarantee is that the writer never sees
   * source documents at all — only claims — so a keyword cannot smuggle in a
   * fact, and anything it did smuggle in would fail the editor's grounding check
   * and the deterministic superlative check afterwards.
   */
  const { writeArticle } = await import('../src/generation/write.ts')
  const { llm } = seoClient()

  const hostileBrief: SeoBrief = brief({
    primaryKeyword: 'mai-code-1-flash deprecation',
    seoTitle: 'GitHub deprecates MAI-Code-1-Flash',
    suggestedHeadings: [
      'What happened',
      // A heading with no verified material behind it. The writer must not
      // invent pricing to fill it.
      'Pricing and cost savings',
    ],
    secondaryKeywords: ['mai-code pricing'],
  })

  const draft = await writeArticle(
    {
      story: {
        id: 'sty_1',
        fingerprint: 'fp_1',
        normalizedTitle: 'github deprecates mai-code-1-flash',
        title: STORY_TITLE,
        category: 'development',
        newsItemIds: [],
        scores: { relevance: 8, importance: 7, freshness: 9, sourceTrust: 10, weighted: 8.5 },
        evidenceState: 'sufficient',
        status: 'verified',
        firstSeenAt: '2026-09-14T00:00:00.000Z',
        lastUpdatedAt: '2026-09-14T00:00:00.000Z',
      },
      claims: CLAIMS,
      evidence: EVIDENCE,
      category: 'development',
      format: 'brief',
      seo: hostileBrief,
    },
    { llm, logger: testLogger(), isSlugTaken: () => false },
  )

  // The mock writer only ever emits claim text plus fact-free connectives, so
  // any price or percentage in the output would mean the SEO heading had pulled
  // invented content through.
  const body = draft.sections
    .flatMap((section) => [...(section.paragraphs ?? []), ...(section.bullets ?? [])])
    .join(' ')

  assert.ok(!/\$\d/.test(body), 'no invented pricing may appear')
  assert.ok(!/\b\d+%/.test(body), 'no invented percentage may appear')
  assert.equal(draft.seo?.primaryKeyword, hostileBrief.primaryKeyword, 'the brief is persisted with the draft')
  assert.equal(draft.format, 'brief', 'SEO must not change the evidence-derived format')
})

test('the persisted brief round-trips through storage', async () => {
  const { openDatabase } = await import('../src/storage/db.ts')
  const { createRepositories } = await import('../src/storage/repositories.ts')
  const repos = createRepositories(openDatabase({ path: ':memory:' }))

  const seo = brief()
  repos.articles.upsert(
    {
      id: 'art_seo', storyId: 'sty_seo', title: 'T', slug: 'seo-slug', excerpt: 'x'.repeat(90),
      sections: [], content: '', category: 'development', tags: [], sourceUrls: [], claimIds: [],
      wordCount: 200, generatedAt: new Date().toISOString(), model: 'mock:test',
      format: 'brief', seo, schemaVersion: 1, confidence: 0.9,
      editorialStatus: 'approved', revisionCount: 0,
    },
    'run_1',
  )

  const stored = repos.articles.findByStory('sty_seo')
  assert.deepEqual(stored?.seo, seo, 'the structured brief must survive persistence intact')
  repos.close()
})

test('an article generated before the SEO layer reads back without a brief', async () => {
  const { openDatabase } = await import('../src/storage/db.ts')
  const { createRepositories } = await import('../src/storage/repositories.ts')
  const repos = createRepositories(openDatabase({ path: ':memory:' }))

  repos.articles.upsert(
    {
      id: 'art_old', storyId: 'sty_old', title: 'T', slug: 'old-slug', excerpt: 'x'.repeat(90),
      sections: [], content: '', category: 'development', tags: [], sourceUrls: [], claimIds: [],
      wordCount: 600, generatedAt: new Date().toISOString(), model: 'mock:test',
      format: 'standard', schemaVersion: 1, confidence: 0.9,
      editorialStatus: 'approved', revisionCount: 0,
    },
    'run_1',
  )

  const stored = repos.articles.findByStory('sty_old')
  assert.equal(stored?.seo, undefined, 'a pre-SEO row must not fabricate a brief')
  repos.close()
})
