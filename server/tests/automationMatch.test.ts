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
import { ASSISTANT, AUTOMATION_MATCH, AUTOMATION_MATCH_WEIGHTS } from '../src/config/limits.ts'
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

  await t.test('between two phrase hits, the shorter title wins even on a lower score', () => {
    const m = createAutomationMatcher([
      bare('long', {
        title: 'review a contract before I sign it and flag anything risky',
        intentLabels: ['review contract', 'sign contract'],
        trustScore: 5,
      }),
      bare('short', { title: 'review a contract before I sign it', trustScore: 1 }),
    ])
    const [first, second] = m.match('review a contract before I sign it')
    assert.equal(first?.automation.id, 'short')
    assert.ok((second?.score ?? 0) > (first?.score ?? 0), 'the order is not the score order here')
  })

  await t.test('phrase hits cannot be outranked, which is what keeps the tiebreak an ordering', () => {
    // A phrase hit has every query term in its title, so it scores at least
    // titlePhrase + titleTerms. That must exceed everything else combined.
    const W = AUTOMATION_MATCH_WEIGHTS
    assert.ok(W.titlePhrase + W.titleTerms > W.titleTerms + W.intentTerms + W.personaTerms + W.toolTerms + W.trust)
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

  await t.test('an overlap is a share of the query: all its terms beat some of them', () => {
    const m = createAutomationMatcher([
      bare('half', { title: 'invoice' }),
      bare('full', { title: 'invoice clients' }),
    ])
    const [first, second] = m.match('invoice clients')
    assert.equal(first?.automation.id, 'full')
    assert.equal(first?.signals.titleTerms, AUTOMATION_MATCH_WEIGHTS.titleTerms, 'every term present is the full weight')
    assert.ok((second?.signals.titleTerms ?? 0) > 0)
    assert.ok((second?.signals.titleTerms ?? 0) < AUTOMATION_MATCH_WEIGHTS.titleTerms)
  })

  await t.test('a rare query term outweighs a common one (IDF)', () => {
    // "client" is in every record; "follow" in one other. A title with the
    // rare term must beat a title with the common term, all else equal.
    const m = createAutomationMatcher([
      bare('common', { title: 'email clients' }),
      bare('rare', { title: 'follow up promptly' }),
      bare('filler-1', { persona: 'client services' }),
      bare('filler-2', { persona: 'client managers' }),
      bare('filler-3', { persona: 'client teams' }),
    ])
    const ranked = m.match('follow up with clients').map((r) => r.automation.id)
    assert.ok(ranked.indexOf('rare') < ranked.indexOf('common'), ranked.join(', '))
  })

  await t.test('a term no record has still counts against every share', () => {
    const m = createAutomationMatcher([bare('a', { title: 'invoice' })])
    const [hit] = m.match('invoice zzzqqq')
    assert.ok((hit?.signals.titleTerms ?? 0) < AUTOMATION_MATCH_WEIGHTS.titleTerms)
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

  await t.test('trust only decides between near-equal text matches', () => {
    // With IDF a share is continuous, so trust CAN separate two text matches —
    // but only ones closer than the whole trust range, which is a small
    // fraction of the lightest field weight.
    const range = AUTOMATION_MATCH_WEIGHTS.trust * (5 - 1) / 5
    assert.ok(range < AUTOMATION_MATCH_WEIGHTS.toolTerms / 5)

    const m = createAutomationMatcher([
      bare('trusted-weaker', { title: 'invoice', trustScore: 5 }),
      bare('stronger', { title: 'invoice clients', trustScore: 1 }),
    ])
    assert.equal(m.match('invoice clients')[0]?.automation.id, 'stronger')
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

  await t.test('matchWithTotal counts past the limit; matches equal match()', () => {
    const ranked = m.matchWithTotal('plan week', { limit: 1 })
    assert.equal(ranked.matches.length, 1)
    assert.equal(ranked.total, 3)
    assert.deepEqual(ranked.matches, m.match('plan week', { limit: 1 }))
    assert.equal(m.matchWithTotal('plan week', { niche: 'Coaches', limit: 1 }).total, 2)
  })

  await t.test('the input is not modified', () => {
    const before = records.map((r) => r.id)
    m.match('plan week')
    assert.deepEqual(records.map((r) => r.id), before)
  })
})

await test('the imported automations: every title retrieves its own automation', async (t) => {
  // SPEC-automations.md §10: "if a row's own title doesn't retrieve it, the
  // matcher is wrong." Measured at 1,560 of 1,560 with IDF and the phrase-
  // length tiebreak, so the floor is every title, at rank 1.
  const all = await createJsonAutomations().list()
  const m = createAutomationMatcher(all)

  await t.test('every automation ranks first for its own title', () => {
    const notFirst = all
      .filter((a) => m.match(a.title, { limit: 1 })[0]?.automation.id !== a.id)
      .map((a) => `${a.niche}: ${a.title}`)
    assert.deepEqual(notFirst, [])
  })
})

/*
 * The gate on the guide the assistant shows above its plan — engine.ts's
 * qualifyingAutomation, SPEC-automations.md §7, "Why the guide gate is an
 * absolute weight".
 *
 * Against the REAL imported set, because an absolute IDF weight only means
 * anything at the scale it was calibrated on: in a two-record fixture every
 * term is worth about idfBase and nothing can clear a floor of 5.2.
 *
 * Each figure below was measured, and is pinned to 3dp rather than to a side
 * of the floor. That is the point of the block: the numbers are the evidence
 * that a gap EXISTS, and a weight change or a re-import that narrows it has to
 * fail here, while the separation is still visible in the diff, rather than
 * silently start showing the scholarship video for "edit videos faster" again.
 * A re-import that moves a figure without closing the gap is expected to
 * update these numbers — read the two extremes before you do.
 */
await test('the guide gate: matched title weight, on the imported set', async (t) => {
  const all = await createJsonAutomations().list()
  const m = createAutomationMatcher(all)
  const floor = ASSISTANT.automationMinTitleWeight * AUTOMATION_MATCH.idfBase

  /** query, measured titleWeight, whether the guide is shown. */
  const CASES: ReadonlyArray<readonly [string, number, boolean]> = [
    ['review a contract before I sign it', 16.931, true],
    ['help me write a cover letter', 14.34, true],
    ['make a study schedule', 9.987, true],
    ['follow up with clients automatically', 8.051, true],
    ['I am a teacher and I want to grade essays faster', 6.407, true],
    // ─── the floor, 5.2 ───
    ['edit videos faster', 4.022, false],
    ['I need AI tools for video editing', 4.022, false],
    ['help me with marketing', 3.517, false],
    ['I need something for my business', 3.259, false],
  ]

  for (const [query, expected, shown] of CASES) {
    await t.test(`${shown ? 'shows' : 'hides'} — "${query}"`, () => {
      const top = m.match(query, { limit: 1 })[0]
      assert.ok(top, 'the query matched nothing at all')
      assert.equal(
        Number(top.titleWeight.toFixed(3)),
        expected,
        `titleWeight moved; top match is "${top.automation.title}"`,
      )
      assert.equal(top.titleWeight >= floor, shown)
    })
  }

  await t.test('the floor sits inside the gap, not on an edge', () => {
    const lowestShown = Math.min(...CASES.filter(([, , s]) => s).map(([, w]) => w))
    const highestHidden = Math.max(...CASES.filter(([, , s]) => !s).map(([, w]) => w))
    assert.ok(
      highestHidden < floor && floor < lowestShown,
      `floor ${floor} is not between ${highestHidden} and ${lowestShown}`,
    )
  })

  await t.test('the scholarship video is a three-signal match, which is why counting failed', () => {
    // The case that killed the rule this replaced: three fields agree, all of
    // them on the query's commonest words.
    const top = m.match('edit videos faster', { limit: 1 })[0]
    assert.ok(top)
    const { trust: _trust, ...text } = top.signals
    assert.equal(Object.values(text).filter((value) => value > 0).length, 3)
    assert.ok(top.signals.titleTerms > 0 && top.signals.intentTerms > 0)
  })
})
