import test from 'node:test'
import assert from 'node:assert/strict'
import { DEDUPE } from '../src/config/limits.ts'
import {
  compareTitles,
  normalizeTitle,
  stripPublisherSuffix,
  titleSimilarity,
} from '../src/dedupe/title.ts'
import { storyFingerprint } from '../src/dedupe/cluster.ts'

test('stripPublisherSuffix removes mastheads but keeps subtitles', () => {
  assert.equal(stripPublisherSuffix('GPT-X launches | TechCrunch'), 'GPT-X launches')
  assert.equal(stripPublisherSuffix('GPT-X launches - The Verge'), 'GPT-X launches')
  assert.equal(stripPublisherSuffix('GPT-X launches — Ars Technica'), 'GPT-X launches')
  // A long tail is part of the headline, not a masthead.
  const subtitle = 'GPT-X launches - a detailed look at what actually changed today'
  assert.equal(stripPublisherSuffix(subtitle), subtitle)
})

test('normalizeTitle folds announcement verbs to one token', () => {
  const forms = [
    'OpenAI releases GPT-X',
    'OpenAI launches GPT-X',
    'OpenAI unveils GPT-X',
    'OpenAI introduces GPT-X',
    'OpenAI announces GPT-X',
  ].map(normalizeTitle)

  for (const form of forms) assert.equal(form, forms[0], `expected identical normalization`)
})

test('the NEWS_AGENT.md §10 worked example collapses to one story', () => {
  // The three headlines the specification uses as its canonical example.
  const a = 'OpenAI releases GPT-X'
  const b = 'GPT-X officially launches'
  const c = 'OpenAI unveils its newest GPT-X model'

  for (const [x, y] of [
    [a, b],
    [a, c],
    [b, c],
  ] as Array<[string, string]>) {
    const verdict = compareTitles(x, y, DEDUPE)
    assert.equal(verdict.sameStory, true, `"${x}" vs "${y}" should be one story (${verdict.score.toFixed(2)})`)
  }
})

test('same event across publications clusters', async (t) => {
  const cases: Array<[string, string]> = [
    ['Anthropic launches Claude 5 with a 1M token context window', 'Claude 5 arrives with 1M context | TechCrunch'],
    ['Google ships Gemini 3 Pro to all developers', 'Gemini 3 Pro is now available to developers - The Verge'],
    ['GitHub Copilot adds agent mode', 'GitHub introduces agent mode for Copilot'],
  ]

  for (const [a, b] of cases) {
    await t.test(a.slice(0, 40), () => {
      const verdict = compareTitles(a, b, DEDUPE)
      assert.equal(verdict.sameStory, true, `score was ${verdict.score.toFixed(3)}`)
    })
  }
})

test('genuinely different stories do not cluster', async (t) => {
  const cases: Array<[string, string]> = [
    ['OpenAI releases GPT-X', 'Anthropic releases Claude 5'],
    ['Figma launches a new design tool', 'Runway launches a new video model'],
    ['Gemini 3 adds image editing', 'Gemini 3 pricing drops by half'],
    ['Hugging Face hosts a new dataset', 'GitHub Copilot adds agent mode'],
  ]

  for (const [a, b] of cases) {
    await t.test(`${a.slice(0, 30)} vs ${b.slice(0, 30)}`, () => {
      const verdict = compareTitles(a, b, DEDUPE)
      assert.equal(verdict.sameStory, false, `score was ${verdict.score.toFixed(3)}`)
    })
  }
})

test('titleSimilarity is symmetric and bounded', () => {
  const a = 'OpenAI releases GPT-X with better reasoning'
  const b = 'GPT-X launches with improved reasoning'
  const forward = titleSimilarity(a, b)
  assert.equal(forward, titleSimilarity(b, a))
  assert.ok(forward >= 0 && forward <= 1, `score ${forward} out of range`)
  assert.equal(titleSimilarity(a, a), 1)
  assert.equal(titleSimilarity('', a), 0)
})

test('storyFingerprint is order-independent and stable', () => {
  assert.equal(
    storyFingerprint('OpenAI releases GPT-X'),
    storyFingerprint('GPT-X released by OpenAI'),
  )
  // Stable across calls — the story id derived from it must not drift.
  assert.equal(storyFingerprint('OpenAI releases GPT-X'), storyFingerprint('OpenAI releases GPT-X'))
  assert.notEqual(storyFingerprint('OpenAI releases GPT-X'), storyFingerprint('Anthropic releases Claude 5'))
})

test('shared distinctive entities promote a near-miss into a match', () => {
  const verdict = compareTitles(
    'OpenAI brings GPT-X to enterprise customers worldwide today',
    'GPT-X now available for OpenAI enterprise plans',
    DEDUPE,
  )
  assert.equal(verdict.sameStory, true)
  assert.ok(verdict.sharedEntities.length >= 2, `shared: ${verdict.sharedEntities.join(',')}`)
})
