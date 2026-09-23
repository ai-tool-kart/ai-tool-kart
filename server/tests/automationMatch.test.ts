/*
 * Automation search — SPEC-automations.md §7.
 *
 * Fixture automations only; the real-data check (every title retrieves its own
 * automation) is the last block. Each signal is isolated by giving the
 * fixtures one field in common with the query and nothing else.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJsonAutomations } from '../src/automations/json.ts'
import { createAutomationMatcher, termsOf } from '../src/automations/match.ts'
import { AUTOMATION_MATCH, AUTOMATION_MATCH_WEIGHTS } from '../src/config/limits.ts'
import { makeAutomation } from './helpers.ts'

/** A fixture whose only text is what the test gives it. */
const bare = (id: string, fields: Parameters<typeof makeAutomation>[0] = {}) =>
  makeAutomation({
    id,
    slug: id,
    title: 'Unrelated placeholder',
    intentLabels: ['placeholder'],
    persona: 'Placeholder persona',
    tools: [{ name: 'Placeholder', url: 'https://example.com' }],
    trustScore: 3,
    ...fields,
  })

await test('terms', async (t) => {
  await t.test('stopwords and short words drop, words are stemmed and deduplicated', () => {
    assert.deepEqual(termsOf('I want AI to edit my videos, editing videos'), ['edit', 'video'])
  })

  await t.test('a query of only stopwords has no terms', () => {
    assert.deepEqual(termsOf('I want to do it'), [])
  })
})

await test('scoring signals', async (t) => {
  await t.test('an exact phrase in the title outranks the same words scattered', () => {
    const m = createAutomationMatcher([
      bare('scattered', { title: 'schedule a study session' }),
      bare('phrase', { title: 'make a study schedule that fits my classes' }),
    ])
    const [first, second] = m.match('study schedule')
    assert.equal(first?.automation.id, 'phrase')
    assert.equal(first?.signals.titlePhrase, AUTOMATION_MATCH_WEIGHTS.titlePhrase)
    assert.equal(second?.signals.titlePhrase, 0)
  })

  await t.test('the phrase hit is whole-word: "plan" is not found inside "planner"', () => {
    const m = createAutomationMatcher([bare('a', { title: 'meal planner app' })])
    assert.equal(m.match('plan')[0]?.signals.titlePhrase ?? 0, 0)
  })

  await t.test('field order follows the weights: title > intent > persona > tools', () => {
    const m = createAutomationMatcher([
      bare('tools', { tools: [{ name: 'Invoice Robot', url: 'https://x.example' }] }),
      bare('persona', { persona: 'Freelancers who invoice clients' }),
      bare('intent', { intentLabels: ['invoice generator'] }),
      bare('title', { title: 'send an invoice' }),
    ])
    assert.deepEqual(
      m.match('invoice').map((r) => r.automation.id),
      ['title', 'intent', 'persona', 'tools'],
    )
  })

  await t.test('an overlap is a share of query terms, not a count', () => {
    const m = createAutomationMatcher([bare('half', { title: 'invoice' })])
    const [hit] = m.match('invoice clients')
    assert.equal(hit?.signals.titleTerms, AUTOMATION_MATCH_WEIGHTS.titleTerms / 2)
  })

  await t.test('stemming meets both ways: "editing videos" finds "edit video"', () => {
    const m = createAutomationMatcher([bare('a', { title: 'edit a video' })])
    assert.equal(m.match('editing videos')[0]?.automation.id, 'a')
  })

  await t.test('trust breaks a tie and never makes a match', () => {
    const m = createAutomationMatcher([
      bare('low', { title: 'plan meals', trustScore: 2 }),
      bare('high', { title: 'plan meals', trustScore: 5 }),
      bare('unrelated', { trustScore: 5 }),
    ])
    const ids = m.match('plan meals').map((r) => r.automation.id)
    assert.deepEqual(ids, ['high', 'low'], 'the trusted one wins the tie; the unrelated one is absent')
  })

  await t.test('trust cannot lift a weaker text match over a stronger one', () => {
    // The largest trust gap (1 vs 5) against the smallest text gap the
    // weights allow: one tool term out of two.
    const gap = AUTOMATION_MATCH_WEIGHTS.trust * (5 - 1) / 5
    assert.ok(gap < AUTOMATION_MATCH_WEIGHTS.toolTerms / 2)
  })

  await t.test('nothing matches a stopword-only query', () => {
    const m = createAutomationMatcher([bare('a', { title: 'I want to do it' })])
    assert.deepEqual(m.match('I want to do it'), [])
  })
})

await test('filters and caps', async (t) => {
  const records = [
    bare('s-1', { niche: 'Students', title: 'plan my week' }),
    bare('c-1', { niche: 'Coaches', title: 'plan my week' }),
    bare('c-2', { niche: 'Coaches', title: 'plan my week', kind: 'mcp' }),
  ]
  const m = createAutomationMatcher(records)

  await t.test('niche narrows', () => {
    assert.deepEqual(m.match('plan week', { niche: 'Coaches' }).map((r) => r.automation.id), ['c-1', 'c-2'])
  })

  await t.test('kind narrows; absent means both', () => {
    assert.deepEqual(m.match('plan week', { kind: 'mcp' }).map((r) => r.automation.id), ['c-2'])
    assert.equal(m.match('plan week').length, 3)
  })

  await t.test('limit caps, defaults, and is clamped to the maximum', () => {
    assert.equal(m.match('plan week', { limit: 1 }).length, 1)
    assert.equal(m.match('plan week', { limit: 0 }).length, 0)

    const many = createAutomationMatcher(
      Array.from({ length: AUTOMATION_MATCH.maxLimit + 5 }, (_, i) => bare(`r-${i}`, { title: 'plan my week' })),
    )
    assert.equal(many.match('plan week').length, AUTOMATION_MATCH.defaultLimit)
    assert.equal(many.match('plan week', { limit: 10_000 }).length, AUTOMATION_MATCH.maxLimit)
  })

  await t.test('the input is not modified', () => {
    const before = records.map((r) => r.id)
    m.match('plan week')
    assert.deepEqual(records.map((r) => r.id), before)
  })
})

await test('the imported automations: every title retrieves its own automation', async (t) => {
  // SPEC-automations.md §10: "if a row's own title doesn't retrieve it, the
  // matcher is wrong." Rank 1 is not always possible — one Startup Founders
  // title is a word-for-word prefix of a Retail title — so the floor is top 3.
  const all = await createJsonAutomations().list()
  const m = createAutomationMatcher(all)
  const ranks = all.map((a) => m.match(a.title, { limit: 10 }).findIndex((r) => r.automation.id === a.id) + 1)

  await t.test('every automation is in the top 3 for its own title', () => {
    const outside = all.filter((_, i) => !(ranks[i]! >= 1 && ranks[i]! <= 3)).map((a) => a.title)
    assert.deepEqual(outside, [])
  })

  await t.test('at least 99.9% rank first', () => {
    const first = ranks.filter((rank) => rank === 1).length
    assert.ok(first / all.length >= 0.999, `${first}/${all.length} rank first`)
  })
})
