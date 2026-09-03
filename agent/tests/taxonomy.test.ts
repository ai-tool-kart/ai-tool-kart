import test from 'node:test'
import assert from 'node:assert/strict'
import { createTaxonomyResolver, isCategoryConfigurationError } from '../src/wordpress/taxonomy.ts'
import { bootstrapCategories, checkTaxonomy, taxonomyIsReady } from '../src/wordpress/bootstrap.ts'
import { publishDraft } from '../src/wordpress/publish.ts'
import { checkTag, canonicalTag, normalizeTags } from '../src/editorial/tags.ts'
import { EDITORIAL_CATEGORIES } from '../src/config/editorial.ts'
import { ARTICLE } from '../src/config/limits.ts'
import { wordPressAuthError } from '../src/domain/errors.ts'
import type { ArticleDraft } from '../src/domain/types.ts'
import { createMockProvider } from '../src/llm/providers/mock.ts'
import { WRITER_SYSTEM, writerUserPrompt } from '../src/llm/prompts/index.ts'
import { ArticleDraftSchema } from '../src/llm/schemas.ts'
import { mockWordPress, testLogger, testRepos } from './helpers.ts'

/*
 * The taxonomy contract (NEWS_AGENT.md §20).
 *
 * One asymmetry is under test throughout, and it is the whole point of the
 * module: CATEGORIES are a fixed editorial allowlist whose absence is fatal, and
 * TAGS are an open-ended entity vocabulary whose absence is not. Any change that
 * makes the two behave alike should fail something here.
 */

const resolver = (client: ReturnType<typeof mockWordPress>, createMissingTags = true) =>
  createTaxonomyResolver({ client, logger: testLogger(), createMissingTags })

/* ── categories: controlled taxonomy ──────────────────────────────────────── */

test('a configured category resolves to the existing WordPress term', async () => {
  const wp = mockWordPress()
  const id = await resolver(wp).resolveCategory('ai-agents')

  const term = wp.terms.find((entry) => entry.slug === 'ai-agents')
  assert.ok(term)
  assert.equal(id, term.id)
  assert.equal(term.name, 'AI Agents')
})

test('a category outside the configured allowlist is rejected before any request', async () => {
  const wp = mockWordPress()
  let calls = 0
  const counting = {
    ...wp,
    findTerm: async (...args: Parameters<typeof wp.findTerm>) => {
      calls += 1
      return wp.findTerm(...args)
    },
  }

  await assert.rejects(
    // A model that invents a category must not reach WordPress at all.
    () => resolver(counting).resolveCategory('crypto-news' as never),
    /not in the configured editorial taxonomy/,
  )
  assert.equal(calls, 0, 'an unconfigured category must not even be looked up')
  assert.equal(wp.terms.filter((t) => t.slug === 'crypto-news').length, 0)
})

test('a configured but absent category is fatal and is never created', async () => {
  // seedCategories:false models a CMS that was never bootstrapped.
  const wp = mockWordPress({ seedCategories: false })

  await assert.rejects(() => resolver(wp).resolveCategory('mcp'), /does not exist/)
  assert.equal(wp.terms.length, 0, 'publishing must never create an editorial category')
})

test('a missing category defers publication with a specific reason', async () => {
  const wp = mockWordPress({ seedCategories: false })
  const repos = testRepos()
  const draft = approvedDraft()
  repos.stories.upsert(story())
  repos.articles.upsert(draft, 'run_test')

  const outcome = await publishDraft(draft, {
    client: wp,
    taxonomy: resolver(wp),
    repos,
    logger: testLogger(),
    dryRun: false,
  })

  assert.equal(outcome.status, 'deferred')
  assert.equal(outcome.status === 'deferred' && outcome.reason, 'category-not-configured')
  assert.equal(wp.created.length, 0, 'no post may be created without a real category')
  // The draft survives for a later run, exactly as a CMS outage would leave it.
  assert.equal(repos.articles.listAwaitingPublication().length, 1)

  repos.close()
})

test('a category configuration error is distinguishable from a transient one', async () => {
  const wp = mockWordPress({ seedCategories: false })
  await resolver(wp)
    .resolveCategory('design')
    .then(
      () => assert.fail('expected a rejection'),
      (error) => assert.ok(isCategoryConfigurationError(error)),
    )
})

/* ── bootstrap: the only place a category is ever created ─────────────────── */

test('taxonomy check is read-only and reports what is missing', async () => {
  const wp = mockWordPress({ seedCategories: false })
  const report = await checkTaxonomy({ client: wp, logger: testLogger() })

  assert.equal(report.authenticated, true)
  assert.equal(report.present, 0)
  assert.equal(report.missing.length, EDITORIAL_CATEGORIES.length)
  assert.equal(report.created.length, 0)
  assert.equal(wp.terms.length, 0, 'check must perform no writes')
  assert.equal(taxonomyIsReady(report), false)
})

test('taxonomy check passes against a bootstrapped site', async () => {
  const wp = mockWordPress()
  const report = await checkTaxonomy({ client: wp, logger: testLogger() })

  assert.equal(report.present, EDITORIAL_CATEGORIES.length)
  assert.equal(report.missing.length, 0)
  assert.equal(taxonomyIsReady(report), true)
})

test('bootstrap creates only allowlisted categories, and no tags', async () => {
  const wp = mockWordPress({ seedCategories: false })
  const report = await bootstrapCategories({ client: wp, logger: testLogger() })

  assert.equal(report.created.length, EDITORIAL_CATEGORIES.length)
  assert.equal(report.failed.length, 0)
  assert.equal(taxonomyIsReady(report), true)

  const slugs = wp.terms.map((term) => term.slug).sort()
  assert.deepEqual(slugs, [...EDITORIAL_CATEGORIES].sort(), 'exactly the allowlist, nothing else')
  assert.ok(
    wp.terms.every((term) => term.taxonomy === 'categories'),
    'bootstrap must never touch the tag taxonomy',
  )
})

test('bootstrap reports a 403 as a capability problem rather than crashing', async () => {
  const wp = mockWordPress({
    seedCategories: false,
    failTermCreation: wordPressAuthError('HTTP 403 rest_cannot_create'),
  })

  const report = await bootstrapCategories({ client: wp, logger: testLogger() })

  assert.equal(report.created.length, 0)
  assert.equal(report.failed.length, EDITORIAL_CATEGORIES.length)
  assert.equal(taxonomyIsReady(report), false)
  assert.match(
    report.categories[0]?.error ?? '',
    /manage_categories/,
    'the report must name the missing capability',
  )
})

test('bootstrap is idempotent: a second run creates nothing', async () => {
  const wp = mockWordPress({ seedCategories: false })
  await bootstrapCategories({ client: wp, logger: testLogger() })
  const afterFirst = wp.terms.length

  const second = await bootstrapCategories({ client: wp, logger: testLogger() })

  assert.equal(second.created.length, 0)
  assert.equal(wp.terms.length, afterFirst, 'existing categories must not be duplicated')
})

/* ── tags: open-ended vocabulary ──────────────────────────────────────────── */

test('an existing tag is reused rather than recreated', async () => {
  const wp = mockWordPress()
  const existing = await wp.createTerm('tags', 'OpenAI', 'openai')
  const before = wp.terms.length

  const ids = await resolver(wp).resolveTags(['OpenAI'])

  assert.deepEqual(ids, [existing.id])
  assert.equal(wp.terms.length, before, 'no new term may be created for an existing tag')
})

test('a missing tag is created when the account can create terms', async () => {
  const wp = mockWordPress()
  const ids = await resolver(wp).resolveTags(['Cursor'])

  assert.equal(ids.length, 1)
  const created = wp.terms.find((term) => term.slug === 'cursor')
  assert.ok(created, 'the tag must have been created')
  assert.equal(created.taxonomy, 'tags')
})

test('a missing tag is skipped, not created, when tag creation is disabled', async () => {
  const wp = mockWordPress()
  const ids = await resolver(wp, false).resolveTags(['Cursor'])

  assert.deepEqual(ids, [])
  assert.equal(wp.terms.some((term) => term.slug === 'cursor'), false)
})

test('a 403 on tag creation is non-fatal and never blocks the post', async () => {
  const wp = mockWordPress({ failTermCreation: wordPressAuthError('HTTP 403 rest_cannot_create') })
  const ids = await resolver(wp).resolveTags(['Cursor', 'Replit'])

  // The contrast with categories is the point: the same 403 is fatal there.
  assert.deepEqual(ids, [], 'unresolvable tags are dropped')
})

test('a post is still created when every tag fails to resolve', async () => {
  const wp = mockWordPress({ failTermCreation: wordPressAuthError('HTTP 403 rest_cannot_create') })
  const repos = testRepos()
  const draft = approvedDraft({ tags: ['Cursor', 'Replit'] })
  repos.stories.upsert(story())
  repos.articles.upsert(draft, 'run_test')

  const outcome = await publishDraft(draft, {
    client: wp,
    taxonomy: resolver(wp),
    repos,
    logger: testLogger(),
    dryRun: false,
  })

  assert.equal(outcome.status, 'created')
  assert.equal(wp.created.length, 1)
  assert.deepEqual(wp.created[0]?.tags, [], 'the post publishes untagged rather than not at all')
  assert.equal(wp.created[0]?.categories.length, 1, 'the category is still required and present')
  assert.equal(wp.created[0]?.status, 'draft', 'draft-only survives the tag failure')

  repos.close()
})

test('capitalisation and spacing variants collapse to one WordPress term', async () => {
  const wp = mockWordPress()
  const ids = await resolver(wp).resolveTags(['OpenAI', 'openai', 'Open AI', '  OpenAI  '])

  assert.equal(ids.length, 1, 'one entity must yield one term id')
  assert.equal(
    wp.terms.filter((term) => term.taxonomy === 'tags').length,
    1,
    'WordPress must not accumulate near-duplicate tags',
  )
})

test('genuinely different products are never merged', async () => {
  const wp = mockWordPress()
  const ids = await resolver(wp).resolveTags(['Gemini', 'Gemma'])
  assert.equal(ids.length, 2, 'similar names must stay distinct — no fuzzy matching')
})

test('malformed tags are rejected before they can reach WordPress', async () => {
  const wp = mockWordPress()
  let creations = 0
  const counting = {
    ...wp,
    createTerm: async (...args: Parameters<typeof wp.createTerm>) => {
      creations += 1
      return wp.createTerm(...args)
    },
  }

  const ids = await resolver(counting).resolveTags([
    '<script>alert(1)</script>',
    'Tag WithNull',
    'a',
    'x'.repeat(80),
    'this is definitely far too many words to be an entity',
    'artificial intelligence',
    '',
    '   ',
  ])

  assert.deepEqual(ids, [], 'nothing malformed may resolve')
  assert.equal(creations, 0, 'no malformed string may reach createTerm')
})

test('checkTag names why each malformed shape was rejected', () => {
  assert.equal(checkTag('OpenAI').ok, true)
  assert.equal(checkTag('GPT-4').ok, true)
  assert.equal(checkTag('Hugging Face').ok, true)

  const reason = (raw: string) => {
    const result = checkTag(raw)
    return result.ok ? 'accepted' : result.reason
  }
  assert.equal(reason('<b>OpenAI</b>'), 'markup')
  assert.equal(reason('OpenAI'), 'control-characters')
  assert.equal(reason('a'), 'too-short')
  assert.equal(reason('x'.repeat(41)), 'too-long')
  assert.equal(reason('one two three four'), 'too-many-words')
  assert.equal(reason('machine learning'), 'theme-not-entity')
  assert.equal(reason('  '), 'empty')
})

test('the tag cap is enforced at the WordPress boundary too', async () => {
  const wp = mockWordPress()
  const many = ['OpenAI', 'Anthropic', 'Claude', 'Gemini', 'Cursor', 'Replit', 'Vercel', 'Notion']
  const ids = await resolver(wp).resolveTags(many)

  assert.equal(
    ids.length,
    ARTICLE.maxTags,
    `no more than ${ARTICLE.maxTags} tags may be attached, whatever the draft carries`,
  )
})

test('canonicalTag maps vocabulary variants and passes unknown entities through', () => {
  assert.equal(canonicalTag('open ai'), 'OpenAI')
  assert.equal(canonicalTag('OPENAI'), 'OpenAI')
  assert.equal(canonicalTag('model context protocol'), 'MCP')
  assert.equal(canonicalTag('Cursor'), 'Cursor', 'an unlisted entity keeps its own name')
  assert.equal(canonicalTag('<script>'), undefined, 'malformed input has no canonical form')
})

/* ── the normaliser that feeds all of the above ───────────────────────────── */

test('a vocabulary tag the article never mentions is dropped', () => {
  // The exact defect that put "Meta" on the GitHub Copilot draft: "meta" occurs
  // inside "metadata", and a curated hit was previously trusted unconditionally.
  const text = 'GitHub Copilot in Visual Studio gained new metadata handling in August.'
  const tags = normalizeTags(['GitHub', 'Meta'], text)

  assert.ok(tags.includes('GitHub'))
  assert.equal(tags.includes('Meta'), false, 'a tag the story never discusses must not survive')
})

test('normalizeTags deduplicates by slug and respects the cap', () => {
  const text = 'OpenAI and Anthropic and Claude and Gemini and Cursor and Replit shipped things.'
  const tags = normalizeTags(
    ['OpenAI', 'openai', 'Open AI', 'Anthropic', 'Claude', 'Gemini', 'Cursor', 'Replit'],
    text,
  )

  assert.equal(new Set(tags.map((t) => t.toLowerCase())).size, tags.length, 'no duplicates')
  assert.ok(tags.length <= ARTICLE.maxTags)
  assert.equal(tags.filter((t) => t.toLowerCase() === 'openai').length, 1)
})

/* ── fixtures ─────────────────────────────────────────────────────────────── */

function story() {
  return {
    id: 'sty_taxonomy',
    fingerprint: 'fp_taxonomy',
    normalizedTitle: 'a story',
    title: 'A story',
    category: 'ai-agents' as const,
    newsItemIds: [],
    scores: { relevance: 8, importance: 8, freshness: 9, sourceTrust: 10, weighted: 8.5 },
    evidenceState: 'sufficient' as const,
    status: 'generated' as const,
    firstSeenAt: '2026-08-20T09:00:00.000Z',
    lastUpdatedAt: '2026-08-20T09:00:00.000Z',
  }
}

function approvedDraft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    id: 'art_taxonomy',
    storyId: 'sty_taxonomy',
    title: 'A story about agents',
    slug: 'a-story-about-agents',
    excerpt:
      'A sufficiently long excerpt so the editorial length rule is satisfied without ' +
      'needing the full pipeline to have produced it.',
    sections: [{ heading: 'What happened', paragraphs: ['Something happened.'] }],
    content: '<h2>What happened</h2>\n<p>Something happened.</p>\n<h2>Sources</h2>',
    category: 'ai-agents',
    tags: ['OpenAI'],
    sourceUrls: ['https://vendor.example.com/news'],
    claimIds: ['clm_x'],
    wordCount: 620,
    generatedAt: '2026-08-20T09:05:00.000Z',
    model: 'mock:mock-strong-v1',
    schemaVersion: 1,
    confidence: 0.82,
    editorialStatus: 'approved',
    editorialIssues: [],
    revisionCount: 0,
    ...overrides,
  }
}

/* ── the mock provider's own tag derivation ───────────────────────────────── */

/*
 * Regression cover for the artifact that reached the first live draft.
 *
 * The mock derived tags with a substring `includes` over the ENTIRE writer
 * prompt, so the GitHub Copilot story was tagged "Meta" — "meta" sits inside
 * "metadata", and the prompt also carries URLs and publisher lists the article
 * never discusses. The tag was wrong on a real WordPress post, which is why the
 * mock is held to the same word-boundary and story-scoped rules as production.
 */
test('the GitHub Copilot mock story tags the products it is actually about', async () => {
  const provider = createMockProvider()
  const prompt = writerUserPrompt({
    storyTitle: 'GitHub Copilot in Visual Studio — August update',
    category: 'ai-agents',
    claims: [
      {
        id: 'clm_aaa111',
        text:
          'August 2026 brought more control over how GitHub Copilot handles workspace ' +
          'metadata and parameters in Visual Studio.',
        claimType: 'capability',
        supportLevel: 'verified',
        publishers: ['GitHub'],
      },
      {
        id: 'clm_bbb222',
        text: 'The update is available to Visual Studio users on the current release channel.',
        claimType: 'launch',
        supportLevel: 'verified',
        publishers: ['GitHub'],
      },
    ],
    evidence: [
      {
        url: 'https://github.blog/changelog/2026-08-28-github-copilot-in-visual-studio-august-update-2',
        publisher: 'GitHub',
        title: 'GitHub Copilot in Visual Studio — August update',
        publishedAt: '2026-08-28',
        trustTier: 1,
      },
    ],
  })

  const response = await provider.complete({
    task: 'write',
    system: WRITER_SYSTEM,
    input: prompt,
    modelClass: 'strong',
    maxOutputTokens: 4096,
    temperature: 0.3,
    // The provider ignores these; the LLM client, not the provider, validates.
    schema: ArticleDraftSchema,
    schemaName: 'ArticleDraft',
  })
  const tags: string[] = JSON.parse(response.text).tags

  assert.equal(
    tags.includes('Meta'),
    false,
    'the story never discusses Meta; "metadata" must not produce that tag',
  )
  assert.ok(tags.includes('GitHub Copilot'), `expected the product to be tagged, got ${tags.join(', ')}`)
  assert.ok(tags.includes('Visual Studio'), `expected the IDE to be tagged, got ${tags.join(', ')}`)
  assert.equal(
    tags.some((tag) => tag.toLowerCase() === 'august'),
    false,
    'a calendar word is phrasing, not an entity',
  )
  assert.ok(tags.length >= ARTICLE.minTags && tags.length <= ARTICLE.maxTags)

  // And the production normaliser keeps them, because they are genuinely present.
  const kept = normalizeTags(tags, 'GitHub Copilot in Visual Studio gained metadata controls.')
  assert.equal(kept.includes('Meta'), false)
})
