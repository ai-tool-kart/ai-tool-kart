/*
 * Retrieval relevance.
 *
 * Table-driven, and asserted against the REAL seed catalogue rather than a
 * fixture. That is a deliberate exception to the rule in
 * ASSISTANT_ARCHITECTURE_PLAN.md §15 that only catalogue.test.ts touches the
 * seed data: relevance is a property of the ranking AND the content together,
 * and a fixture of four invented tools proves nothing about whether "edit videos
 * faster" finds Descript.
 *
 * ── How these assertions are written, and why ─────────────────────────────────
 *
 * Every case asserts a SET within a RANK RANGE — "these tools appear in the top
 * five" — never an exact ordering. Exact-order assertions on a scorer with
 * twelve signals are a tax: adding one tool to the catalogue reshuffles ties and
 * the suite fails without anything being wrong. A set-within-range assertion
 * fails only when the answer genuinely got worse, which is the only failure
 * worth waking up for.
 *
 * The scorer is pure (score.ts), so these are exact and fast despite running
 * against all 66 records.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import { RETRIEVAL } from '../src/config/limits.ts'
import { normalizeQuery, queryTerms, stem } from '../src/retrieval/normalize.ts'
import { explainScore } from '../src/retrieval/score.ts'
import { createRetrievalService } from '../src/retrieval/service.ts'
import { makeTool, testLogger } from './helpers.ts'

const catalogue = createJsonToolCatalogue()
const retrieval = createRetrievalService({ catalogue, logger: testLogger() })

/** Ranked slugs for a query, plus a readable breakdown for a failure message. */
async function rank(query: string, limit = 10) {
  const result = await retrieval.retrieve({ query, limit })
  return {
    slugs: result.candidates.map((entry) => entry.tool.slug),
    result,
    explain: () => result.candidates.map(explainScore).join('\n      '),
  }
}

/* ═══ Normalisation ════════════════════════════════════════════════════════ */

await test('normalisation', async (t) => {
  await t.test('stems plurals without mangling short words', () => {
    assert.equal(stem('videos'), 'video')
    assert.equal(stem('queries'), 'query')
    assert.equal(stem('searches'), 'search')
    assert.equal(stem('bus'), 'bus', 'a short -us word is left alone')
    assert.equal(stem('css'), 'css', 'a doubled-s word is left alone')
  })

  await t.test('stems -ing and -ed to the base verb', () => {
    assert.equal(stem('editing'), 'edit')
    assert.equal(stem('writing'), 'writ')
    assert.equal(stem('running'), 'run')
    assert.equal(stem('ring'), 'ring', 'too short to strip')
  })

  await t.test('drops stopwords and keeps domain verbs', () => {
    const terms = queryTerms('I want the best AI tool to help me edit my videos')
    assert.ok(terms.includes('edit'), 'a stage verb must survive')
    assert.ok(terms.includes('video'))
    for (const noise of ['want', 'best', 'help', 'tool']) {
      assert.equal(terms.includes(noise), false, `"${noise}" carries no signal`)
    }
  })

  await t.test('the design INTENT_MAP short-circuits a known suggestion chip', () => {
    assert.deepEqual(queryTerms('automate my workflow'), ['automate', 'workflow', 'agent'])
  })

  await t.test('synonyms expand without losing the original term', () => {
    const terms = queryTerms('generate a vo for my deck')
    assert.ok(terms.includes('voice'))
    assert.ok(terms.includes('presentation'))
  })

  await t.test('infers category, stage and role', () => {
    const normalized = normalizeQuery("I'm a video editor who needs to edit long footage")
    assert.ok(normalized.categories.includes('Video'))
    assert.ok(normalized.stages.includes('edit'))
    assert.ok(normalized.roles.includes('Video Editor'))
  })

  await t.test('caller context outranks anything inferred', () => {
    const normalized = normalizeQuery('edit videos', { role: 'Marketer', stages: ['publish'] })
    assert.equal(normalized.roles[0], 'Marketer')
    assert.equal(normalized.stages[0], 'publish')
  })

  await t.test('a budget word is widened to accept a free tier', () => {
    // "free tools for writing" must not penalise every freemium product.
    assert.deepEqual(normalizeQuery('free tools for writing').pricingTiers, ['free', 'freemium'])
  })

  await t.test('an empty query is reported as empty rather than guessed at', () => {
    const normalized = normalizeQuery('   the a of and   ')
    assert.equal(normalized.empty, true)
    assert.deepEqual(normalized.terms, [])
  })

  await t.test('a goal needs two shared terms, so one word cannot fire five goals', () => {
    const normalized = normalizeQuery('research papers faster')
    assert.equal(
      normalized.useCases.includes('Research documentation'),
      false,
      'the bare word "research" must not infer every Research* goal',
    )
    assert.ok(normalized.useCases.includes('Summarize papers'))
  })
})

/* ═══ The relevance table ══════════════════════════════════════════════════ */

interface RelevanceCase {
  domain: string
  query: string
  /** Every slug must appear within the first `within` results. */
  expect: string[]
  within: number
  /** Slugs that must NOT appear in the top `within`. */
  reject?: string[]
}

const CASES: RelevanceCase[] = [
  {
    // The case ASSISTANT_ARCHITECTURE_PLAN.md §14 names explicitly as the
    // Phase C acceptance criterion.
    domain: 'video — the plan\'s acceptance case',
    query: 'edit videos faster',
    expect: ['descript', 'opus-clip'],
    within: 5,
  },
  {
    domain: 'video — the plan\'s manual-verification expectation',
    query: 'edit videos faster',
    expect: ['descript', 'opus-clip', 'runway'],
    within: 5,
  },
  {
    domain: 'video — short-form repurposing',
    query: 'make short clips from podcasts',
    expect: ['opus-clip'],
    within: 3,
    // "Make" is a real automation platform whose name is an ordinary English
    // word. It must not win on the verb in the user's sentence.
    reject: ['make'],
  },
  {
    domain: 'video — captions',
    query: 'add subtitles to my youtube videos',
    expect: ['veed'],
    within: 5,
  },
  {
    domain: 'coding — debugging',
    query: 'help me debug React',
    expect: ['cursor', 'github-copilot', 'claude-code'],
    within: 6,
  },
  {
    domain: 'coding — shipping an app',
    query: 'build a web app quickly',
    expect: ['replit'],
    within: 6,
  },
  {
    domain: 'design — wireframes',
    query: 'turn a sketch into wireframes',
    expect: ['uizard'],
    within: 5,
  },
  {
    domain: 'design — social graphics',
    query: 'design social media posts',
    expect: ['canva'],
    within: 3,
  },
  {
    domain: 'presentations / productivity',
    query: 'create presentations from an outline',
    expect: ['gamma'],
    within: 3,
  },
  {
    domain: 'writing — marketing copy',
    query: 'write marketing copy',
    expect: ['copy-ai'],
    within: 3,
  },
  {
    domain: 'writing — proofreading',
    query: 'fix my grammar and tone',
    expect: ['grammarly'],
    within: 5,
  },
  {
    domain: 'research — academic papers',
    query: 'research papers faster',
    expect: ['elicit', 'consensus'],
    within: 5,
  },
  {
    domain: 'research — grounded answers',
    query: 'answer questions from my own documents with citations',
    expect: ['notebooklm'],
    within: 5,
  },
  {
    domain: 'marketing — seo',
    query: 'improve seo for my blog',
    expect: ['surfer-seo'],
    within: 5,
  },
  {
    domain: 'automation',
    query: 'automate repetitive work',
    expect: ['zapier'],
    within: 5,
  },
  {
    domain: 'audio — voiceover',
    query: 'generate voiceovers',
    expect: ['elevenlabs'],
    within: 3,
  },
  {
    domain: 'audio — music',
    query: 'generate background music for a video',
    expect: ['suno'],
    within: 5,
  },
  {
    domain: 'image generation',
    query: 'generate illustrations for an article',
    expect: ['midjourney'],
    within: 6,
  },
  {
    domain: 'image editing',
    query: 'remove background from product photos',
    expect: ['photoroom'],
    within: 2,
  },
  {
    domain: 'data',
    query: 'analyse a spreadsheet and build a dashboard',
    expect: ['julius-ai'],
    within: 5,
  },
]

await test('relevance', async (t) => {
  for (const testCase of CASES) {
    await t.test(`${testCase.domain}: "${testCase.query}"`, async () => {
      const { slugs, explain } = await rank(testCase.query)
      const top = slugs.slice(0, testCase.within)

      for (const slug of testCase.expect) {
        assert.ok(
          top.includes(slug),
          `expected "${slug}" in the top ${testCase.within}, got [${top.join(', ')}]\n` +
            `      ${explain()}`,
        )
      }
      for (const slug of testCase.reject ?? []) {
        assert.equal(
          top.includes(slug),
          false,
          `"${slug}" must not reach the top ${testCase.within}: [${top.join(', ')}]`,
        )
      }
    })
  }
})

/* ═══ Behaviour that is not about any one query ════════════════════════════ */

await test('retrieval behaviour', async (t) => {
  await t.test('an explicitly named tool wins outright', async () => {
    assert.equal((await rank('descript')).slugs[0], 'descript')
    assert.equal((await rank('what does opus clip do')).slugs[0], 'opus-clip')
  })

  await t.test('results are deterministic across runs', async () => {
    const first = await rank('edit videos faster')
    const second = await rank('edit videos faster')
    assert.deepEqual(first.slugs, second.slugs)
  })

  await t.test('a rejected tool never returns, whatever it scores', async () => {
    const result = await retrieval.retrieve({
      query: 'edit videos faster',
      context: { rejectedToolIds: ['descript'] },
    })
    assert.equal(
      result.candidates.some((entry) => entry.tool.id === 'descript'),
      false,
    )
  })

  await t.test('an explicit pricing filter is hard, not a scoring nudge', async () => {
    const result = await retrieval.retrieve({
      query: 'edit videos',
      filters: { pricingTiers: ['free'] },
    })
    assert.ok(result.candidates.every((entry) => entry.tool.pricingTier === 'free'))
  })

  await t.test('an inferred category is a signal, never a filter', async () => {
    // "edit videos" infers Video. If that inference filtered, the assistant
    // could never staff the audio step of a video workflow.
    const result = await retrieval.retrieve({ query: 'edit videos faster', limit: 40 })
    assert.ok(
      result.candidates.some((entry) => entry.tool.cat !== 'Video'),
      'a guess must not be able to delete a right answer',
    )
  })

  await t.test('the candidate cap is respected', async () => {
    const result = await retrieval.retrieve({ query: 'ai tools', limit: 999 })
    assert.ok(result.candidates.length <= RETRIEVAL.maxCandidates)
  })

  await t.test('the default candidate count matches the plan', async () => {
    const result = await retrieval.retrieve({ query: 'write and design and build and analyse' })
    assert.ok(result.candidates.length <= RETRIEVAL.defaultCandidates)
  })

  await t.test('every inferred stage gets at least two candidates', async () => {
    const result = await retrieval.retrieve({
      query: 'research the market, design a landing page and build it',
    })
    assert.ok(result.interpretation.stages.length >= 2, 'the query must infer several stages')

    for (const stage of result.interpretation.stages) {
      const staffed = result.candidates.filter((entry) => entry.tool.stages.includes(stage)).length
      assert.ok(
        staffed >= RETRIEVAL.minPerStage,
        `stage "${stage}" got ${staffed} candidates in the shortlist`,
      )
    }
    assert.deepEqual(result.unmetStages, [])
  })

  await t.test('a stage the catalogue cannot staff is reported, not faked', async () => {
    // The failure mode this guards: padding a thin stage with a plausible but
    // unrelated tool makes the plan look complete and be wrong.
    const thin = createRetrievalService({
      catalogue: createJsonToolCatalogue({
        records: [
          makeTool({ id: 'only-drafter', slug: 'only-drafter', stages: ['draft'] }),
          makeTool({ id: 'other-drafter', slug: 'other-drafter', stages: ['draft'] }),
        ],
      }),
    })

    const result = await thin.retrieve({ query: 'draft an article then publish it' })
    assert.ok(result.interpretation.stages.includes('publish'))
    assert.ok(result.unmetStages.includes('publish'), 'the shortfall must be surfaced')

    const publishCoverage = result.coverage.find((entry) => entry.stage === 'publish')
    assert.equal(publishCoverage?.available, 0)
    assert.equal(publishCoverage?.satisfied, false)
  })

  await t.test('an empty query is reported as such rather than answered', async () => {
    const result = await retrieval.retrieve({ query: '' })
    assert.equal(result.interpretation.empty, true)
  })

  await t.test('draft records are never recommended', async () => {
    const withDraft = createRetrievalService({
      catalogue: createJsonToolCatalogue({
        records: [
          makeTool({ id: 'live-one', slug: 'live-one', pop: 10 }),
          makeTool({ id: 'hidden-one', slug: 'hidden-one', pop: 100, status: 'draft' }),
        ],
      }),
    })
    const result = await withDraft.retrieve({ query: 'draft an article' })
    assert.deepEqual(
      result.candidates.map((entry) => entry.tool.id),
      ['live-one'],
    )
  })

  await t.test('the score breakdown sums to the reported score', async () => {
    // The inspectability promise in §9: a wrong recommendation must be
    // debuggable by reading numbers, which requires the numbers to add up.
    const result = await retrieval.retrieve({ query: 'edit videos faster', limit: 5 })
    for (const entry of result.candidates) {
      const sum = Object.values(entry.signals).reduce((total, value) => total + value, 0)
      assert.ok(
        Math.abs(sum - entry.score) < 1e-9,
        `${entry.tool.name}: signals sum to ${sum} but score is ${entry.score}`,
      )
    }
  })

  await t.test('the interpretation explains why results were selected', async () => {
    const result = await retrieval.retrieve({ query: 'edit videos faster' })
    assert.deepEqual(result.interpretation.terms, ['edit', 'video'])
    assert.deepEqual(result.interpretation.categories, ['Video'])
    assert.deepEqual(result.interpretation.stages, ['edit'])
    assert.ok(result.considered > 0)
  })
})
