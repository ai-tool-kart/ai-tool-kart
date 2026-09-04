import test from 'node:test'
import assert from 'node:assert/strict'
import { renderArticleHtml, sectionsToPlainText } from '../src/generation/render.ts'
import { slugify, uniqueSlug } from '../src/generation/slug.ts'
import { normalizeTags } from '../src/editorial/tags.ts'
import { deterministicChecks } from '../src/editorial/validate.ts'
import { computeScores, freshnessScore, selectStory, sourceTrustScore } from '../src/ranking/score.ts'
import { prefilterStory } from '../src/ranking/prefilter.ts'
import { buildPostPayload } from '../src/wordpress/publish.ts'
import { EDITORIAL_SCOPE } from '../src/config/editorial.ts'
import { fixedClock } from '../src/utils/time.ts'
import type { ArticleDraft, CandidateStory, NewsItem, TrustTier } from '../src/domain/types.ts'

/* ── Slugs ────────────────────────────────────────────────────────────────── */

test('slugify produces URL-safe, stable slugs', async (t) => {
  const cases: Array<[string, string]> = [
    ['OpenAI Launches GPT-5 Turbo', 'openai-launches-gpt-5-turbo'],
    ['Café & Résumé AI', 'cafe-and-resume-ai'],
    ['  Leading and trailing  ', 'leading-and-trailing'],
    ['Multiple---dashes', 'multiple-dashes'],
    ['GPT-4.5 ships today', 'gpt-4-5-ships-today'],
    ['100% faster', '100-faster'],
    ['   ---   ', 'ai-tool-kart-news'],
    ['', 'ai-tool-kart-news'],
  ]
  for (const [input, expected] of cases) {
    await t.test(JSON.stringify(input), () => {
      assert.equal(slugify(input), expected)
    })
  }
})

test('slugify is deterministic and length-bounded', () => {
  const long = 'Vendor announces an extremely long product name that goes on and on and on forever indeed'
  const slug = slugify(long)
  assert.ok(slug.length <= 72, `slug was ${slug.length} chars`)
  assert.equal(slug, slugify(long), 'must be stable across calls')
  assert.ok(!slug.endsWith('-'), 'must not end on a separator')
  assert.ok(/^[a-z0-9-]+$/.test(slug))
})

test('uniqueSlug resolves collisions without changing an uncontested slug', () => {
  assert.equal(uniqueSlug('A Title', () => false), 'a-title')

  const taken = new Set(['a-title', 'a-title-2'])
  assert.equal(uniqueSlug('A Title', (slug) => taken.has(slug)), 'a-title-3')
})

/* ── Tags ─────────────────────────────────────────────────────────────────── */

test('tag vocabulary collapses spelling variants to one canonical term', () => {
  const tags = normalizeTags(['openai', 'Open AI', 'OpenAI'], 'OpenAI shipped something')
  assert.deepEqual(tags, ['OpenAI'], 'three spellings must become one tag')
})

test('theme words are never accepted as tags', () => {
  const tags = normalizeTags(
    ['AI', 'Technology', 'Innovation', 'the future'],
    'AI Technology Innovation the future',
  )
  assert.equal(tags.length, 0, `expected no tags, got ${tags.join(',')}`)
})

test('an unlisted vendor can still be tagged when it reads as a proper noun', () => {
  const tags = normalizeTags(['Aurora', 'NewVendor'], 'Aurora from NewVendor launched today')
  assert.ok(tags.includes('Aurora'))
  assert.ok(tags.includes('NewVendor'))
})

test('a proposed tag absent from the article is rejected', () => {
  const tags = normalizeTags(['Nonexistent'], 'This article never mentions that company')
  assert.ok(!tags.includes('Nonexistent'))
})

test('tags are capped at the maximum', () => {
  const proposed = ['OpenAI', 'Anthropic', 'Google', 'Microsoft', 'Meta', 'Mistral', 'GitHub']
  const tags = normalizeTags(proposed, proposed.join(' '))
  assert.ok(tags.length <= 5, `expected at most 5 tags, got ${tags.length}`)
})

/* ── Rendering ────────────────────────────────────────────────────────────── */

const SECTIONS = [
  { heading: 'What happened', paragraphs: ['Vendor shipped Aurora 2 today for all paid accounts.'] },
  { heading: "What's new", bullets: ['A 500,000 token context window', 'Improved tool use'] },
]

test('rendering produces the expected structure', () => {
  const { html, wordCount } = renderArticleHtml({
    sections: SECTIONS,
    sources: [
      { url: 'https://vendor.example.com/a', publisher: 'Vendor', title: 'Aurora 2', publishedAt: '2026-08-20T09:00:00Z' },
    ],
  })

  assert.ok(html.includes('<h2>What happened</h2>'))
  assert.ok(html.includes('<p>Vendor shipped Aurora 2 today for all paid accounts.</p>'))
  assert.ok(html.includes('<li>A 500,000 token context window</li>'))
  assert.ok(html.includes('<h2>Sources</h2>'))
  assert.ok(html.includes('Vendor, 2026-08-20'), 'publisher and date should be shown')
  assert.ok(wordCount > 0)
})

test('word count measures the prose, not the sources block', () => {
  const withoutSources = renderArticleHtml({ sections: SECTIONS, sources: [] })
  const withSources = renderArticleHtml({
    sections: SECTIONS,
    sources: Array.from({ length: 5 }, (_, i) => ({
      url: `https://vendor.example.com/source-${i}`,
      publisher: 'A publisher with a long name',
      title: 'A source title with several words in it',
    })),
  })
  assert.equal(withoutSources.wordCount, withSources.wordCount)
})

test('duplicate source URLs appear once', () => {
  const { html } = renderArticleHtml({
    sections: SECTIONS,
    sources: [
      { url: 'https://vendor.example.com/a', publisher: 'Vendor', title: 'A' },
      { url: 'https://vendor.example.com/a', publisher: 'Vendor', title: 'A again' },
    ],
  })
  assert.equal(html.split('https://vendor.example.com/a').length - 1, 1)
})

test('sectionsToPlainText is readable and markup-free', () => {
  const text = sectionsToPlainText(SECTIONS)
  assert.ok(text.includes('## What happened'))
  assert.ok(text.includes('- Improved tool use'))
  assert.ok(!text.includes('<'))
})

/* ── Scoring ──────────────────────────────────────────────────────────────── */

test('freshness decays with age', () => {
  assert.equal(freshnessScore(0), 10)
  assert.ok(freshnessScore(24) > freshnessScore(72))
  assert.equal(freshnessScore(1000), 0)
  assert.equal(freshnessScore(Number.POSITIVE_INFINITY), 0)
})

test('a single Tier 1 source outranks many Tier 2 outlets', () => {
  const tier1 = sourceTrustScore([1], 1)
  const manyTier2 = sourceTrustScore([2, 2, 2, 2], 4)
  assert.ok(tier1 > manyTier2, `Tier 1 (${tier1}) must outrank four Tier 2 (${manyTier2})`)
})

test('corroboration is bounded', () => {
  assert.equal(sourceTrustScore([2], 10), sourceTrustScore([2], 3), 'the bonus must cap')
})

test('the topic prior cannot carry an irrelevant story', () => {
  const scores = computeScores({
    relevance: 1,
    importance: 1,
    ageHours: 0,
    tiers: [1],
    independentPublishers: 3,
    topicAdjustment: 20, // an absurdly large keyword prior
  })

  const verdict = selectStory({
    weighted: scores.weighted,
    relevance: scores.relevance,
    importance: scores.importance,
    hasTier1: true,
    independentPublishers: 3,
    minWeightedScore: 6,
  })

  assert.equal(verdict.selected, false, 'a relevance of 1 must never be selected')
  assert.match(verdict.reason ?? '', /relevance-floor/)
})

test('a strong story is selected', () => {
  const scores = computeScores({
    relevance: 9, importance: 8, ageHours: 2, tiers: [1], independentPublishers: 2, topicAdjustment: 2,
  })
  const verdict = selectStory({
    weighted: scores.weighted, relevance: scores.relevance, importance: scores.importance,
    hasTier1: true, independentPublishers: 2, minWeightedScore: 6,
  })
  assert.equal(verdict.selected, true, `weighted was ${scores.weighted}`)
})

test('a story with no credible source base is rejected', () => {
  const verdict = selectStory({
    weighted: 9, relevance: 9, importance: 9, hasTier1: false, independentPublishers: 1, minWeightedScore: 6,
  })
  assert.equal(verdict.selected, false)
  assert.match(verdict.reason ?? '', /source-base/)
})

/* ── Prefilters ───────────────────────────────────────────────────────────── */

function story(overrides: Partial<CandidateStory> = {}): CandidateStory {
  return {
    id: 'sty_1', fingerprint: 'fp', normalizedTitle: 'n', title: 'Vendor launches Aurora 2 today',
    newsItemIds: ['itm_1'],
    scores: { relevance: 0, importance: 0, freshness: 0, sourceTrust: 0, weighted: 0 },
    evidenceState: 'none', status: 'candidate',
    firstSeenAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function newsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'itm_1', sourceId: 'vendor-news', title: 'Vendor launches Aurora 2 today',
    url: 'https://vendor.example.com/a', canonicalUrl: 'https://vendor.example.com/a',
    discoveredAt: new Date().toISOString(), publishedAt: new Date().toISOString(),
    status: 'new', ...overrides,
  }
}

const TIERS = new Map<string, TrustTier>([['vendor-news', 1], ['techpress-ai', 2]])

test('hard-rejected topics never reach the classifier', async (t) => {
  const cases: Array<[string, string]> = [
    ['clickbait', 'You won\'t believe this shocking AI trick that changes everything'],
    ['listicle', 'Top 10 AI prompts you should be using right now for productivity'],
    ['stock', 'Nvidia shares rose after the earnings report beat expectations'],
    ['crypto', 'A new web3 metaverse NFT platform adds AI features for traders'],
  ]
  for (const [label, title] of cases) {
    await t.test(label, () => {
      const verdict = prefilterStory({
        story: story({ title }),
        items: [newsItem({ title })],
        tierBySourceId: TIERS,
      })
      assert.equal(verdict.pass, false, `"${title}" should have been hard-rejected`)
      assert.match(verdict.reason ?? '', /excluded-topic/)
    })
  }
})

test('a legitimate launch passes the prefilter with a positive prior', () => {
  const verdict = prefilterStory({
    story: story(),
    items: [newsItem({ rawSummary: 'OpenAI launches a new model with a larger context window.' })],
    tierBySourceId: TIERS,
  })
  assert.equal(verdict.pass, true)
  assert.ok(verdict.topicAdjustment > 0)
  assert.equal(verdict.hasTier1, true)
})

test('stale stories are rejected', () => {
  const old = new Date(Date.now() - 200 * 3_600_000).toISOString()
  const verdict = prefilterStory({
    story: story({ firstSeenAt: old }),
    items: [newsItem({ publishedAt: old, discoveredAt: old })],
    tierBySourceId: TIERS,
  })
  assert.equal(verdict.pass, false)
  assert.match(verdict.reason ?? '', /stale/)
})

/*
 * The staleness gate is what the test-clock work in helpers.ts steers around,
 * so it gets pinned from both sides here. If someone ever "fixes" a rotting
 * fixture by widening maxStoryAgeHours, the boundary case below fails.
 */
test('the staleness gate is exact at maxStoryAgeHours', async (t) => {
  const publishedAt = '2026-08-20T12:00:00.000Z'
  const max = EDITORIAL_SCOPE.maxStoryAgeHours

  const verdictAt = (hoursLater: number) =>
    prefilterStory({
      story: story({ firstSeenAt: publishedAt }),
      items: [newsItem({ publishedAt, discoveredAt: publishedAt })],
      tierBySourceId: TIERS,
      clock: fixedClock(new Date(Date.parse(publishedAt) + hoursLater * 3_600_000)),
    })

  await t.test('just inside the window passes', () => {
    const verdict = verdictAt(max - 1)
    assert.equal(verdict.pass, true, `a story ${max - 1}h old must still be current`)
  })

  await t.test('just outside the window is rejected', () => {
    const verdict = verdictAt(max + 1)
    assert.equal(verdict.pass, false, `a story ${max + 1}h old must be stale`)
    assert.match(verdict.reason ?? '', /stale/)
  })

  await t.test('the threshold is a real limit, not an accident of test data', () => {
    assert.ok(max > 0 && Number.isFinite(max), 'maxStoryAgeHours must bound something')
    assert.equal(verdictAt(max * 10).pass, false, 'genuinely old news must never pass')
  })
})

test('an already-published story is never reconsidered', () => {
  const verdict = prefilterStory({
    story: story({ status: 'published' }),
    items: [newsItem()],
    tierBySourceId: TIERS,
  })
  assert.equal(verdict.pass, false)
  assert.equal(verdict.reason, 'already-published')
})

/* ── Editorial deterministic checks ───────────────────────────────────────── */

function draft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    id: 'art_1', storyId: 'sty_1', title: 'Vendor launches Aurora 2',
    slug: 'vendor-launches-aurora-2', excerpt: 'x'.repeat(120),
    sections: SECTIONS, content: '<h2>What happened</h2>\n<p>Text.</p>\n<h2>Sources</h2>\n<ul><li>a</li></ul>',
    category: 'ai-models', tags: ['OpenAI', 'Claude'],
    sourceUrls: ['https://vendor.example.com/a'], claimIds: ['clm_1'], wordCount: 600,
    generatedAt: new Date().toISOString(), model: 'mock:test', schemaVersion: 1,
    confidence: 0, editorialStatus: 'pending', revisionCount: 0,
    ...overrides,
  }
}

test('a well-formed draft raises no blocking issues', () => {
  const issues = deterministicChecks(draft(), [{ id: 'clm_1', text: 't', evidenceUrls: [], supportLevel: 'verified', claimType: 'launch' }])
  assert.deepEqual(issues.blocking, [], `unexpected blocking issues: ${issues.blocking.join(', ')}`)
})

test('a missing sources section blocks publication', () => {
  const issues = deterministicChecks(draft({ content: '<p>No sources here.</p>' }), [])
  assert.ok(issues.blocking.includes('missing-sources-section'))
})

test('banned phrases block and are writer-fixable', () => {
  const issues = deterministicChecks(
    draft({
      sections: [{ heading: 'H', paragraphs: ['This is a game-changing revolutionary release.'] }],
    }),
    [],
  )
  assert.ok(issues.blocking.some((issue) => issue.includes('game-changing')))
  assert.ok(issues.writerFixable.some((issue) => issue.includes('game-changing')))
})

test('too few tags is advisory, not blocking', () => {
  const issues = deterministicChecks(draft({ tags: ['OpenAI'] }), [])
  assert.ok(issues.advisory.some((issue) => issue.startsWith('too-few-tags')))
  assert.ok(!issues.blocking.some((issue) => issue.startsWith('too-few-tags')))
})

test('markup outside the allowlist blocks publication', () => {
  const issues = deterministicChecks(
    draft({ content: '<h2>Sources</h2><script>alert(1)</script>' }),
    [],
  )
  assert.ok(issues.blocking.some((issue) => issue.startsWith('disallowed-html-tags')))
})

test('a draft with no claim traceability blocks publication', () => {
  const issues = deterministicChecks(draft({ claimIds: [] }), [
    { id: 'clm_1', text: 't', evidenceUrls: [], supportLevel: 'verified', claimType: 'launch' },
  ])
  assert.ok(issues.blocking.includes('no-claim-traceability'))
})

/* ── WordPress payload ────────────────────────────────────────────────────── */

test('the payload is always a draft and carries exactly one category', () => {
  const payload = buildPostPayload(draft(), 7, [10, 11])

  assert.equal(payload.status, 'draft')
  assert.deepEqual(payload.categories, [7])
  assert.deepEqual(payload.tags, [10, 11])
  assert.equal(payload.slug, 'vendor-launches-aurora-2')
  assert.ok(payload.excerpt.length > 0, 'excerpt must be explicit, never auto-generated')
  assert.ok(payload.content.includes('<h2>'))
})

test('tag backfill matches whole words, not substrings', () => {
  /*
   * Regression guard. A substring match tagged a Google story with "Meta"
   * because the body mentioned "metadata" — a wrong factual association on a
   * published post.
   */
  const tags = normalizeTags([], 'Google updated the metadata parameters for its search index today.')
  assert.ok(!tags.includes('Meta'), `"metadata" must not yield the Meta tag (got ${tags.join(',')})`)
  assert.ok(tags.includes('Google'), 'a genuine whole-word match should still resolve')
})

test('tag backfill still matches a real mention', () => {
  const tags = normalizeTags([], 'Meta and OpenAI both shipped updates today.')
  assert.ok(tags.includes('Meta'))
  assert.ok(tags.includes('OpenAI'))
})
