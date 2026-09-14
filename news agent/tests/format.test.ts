/*
 * Evidence-based article formats (§15).
 *
 * The rule under test is that LENGTH IS AN OUTPUT OF EVIDENCE. The first real
 * article the pipeline produced was 176 words because its only source was a
 * GitHub changelog entry supporting eight small facts. Under a single global
 * 500-word minimum that was reported as a failure, when in fact the writer had
 * done the right thing — §14 forbids inventing, so the only route to 500 was
 * padding.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { ARTICLE_FORMATS } from '../src/config/limits.ts'
import { formatRange, selectArticleFormat, toArticleFormat } from '../src/editorial/format.ts'
import type { Claim, SourceEvidence } from '../src/domain/types.ts'

function claims(verified: number, singleSource = 0, unsupported = 0): Claim[] {
  const make = (supportLevel: Claim['supportLevel'], index: number): Claim => ({
    id: `clm_${supportLevel}_${index}`,
    text: 'A factual statement extracted from the source material.',
    claimType: 'capability',
    supportLevel,
    evidenceUrls: ['https://a.test/1'],
  })
  return [
    ...Array.from({ length: verified }, (_, i) => make('verified', i)),
    ...Array.from({ length: singleSource }, (_, i) => make('single-source', i)),
    ...Array.from({ length: unsupported }, (_, i) => make('unsupported', i)),
  ]
}

function evidence(count: number, publishers?: string[]): SourceEvidence[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ev_${i}`,
    storyId: 'sty_test',
    url: `https://source${i}.test/article`,
    publisher: publishers?.[i] ?? `Publisher ${i}`,
    title: 'Some article',
    trustTier: 1 as const,
    sourceType: 'official-blog' as const,
    cleanedText: 'Source text.',
    extractedFacts: [],
    retrievedAt: '2026-09-14T00:00:00.000Z',
    contentHash: `hash_${i}`,
  }))
}

/* ── the real regression ──────────────────────────────────────────────────── */

test('the 176-word GitHub changelog story is a brief, not a failed standard', () => {
  // The exact signals from the first real article: 8 verified claims, one Tier 1
  // source, one publisher, importance 7.
  const decision = selectArticleFormat({
    claims: claims(8),
    evidence: evidence(1, ['GitHub']),
    importance: 7,
  })

  assert.equal(decision.format, 'brief')
  assert.equal(decision.targetMinWords, 180)
  assert.equal(decision.targetMaxWords, 350)

  // 176 words sits 4 words under a brief, against 324 under the old global 500.
  // The point is not that 176 becomes compliant, it is that the target the
  // writer is given is one the evidence can actually reach.
  assert.ok(176 < decision.targetMinWords)
  assert.ok(decision.targetMinWords - 176 < 10, 'a brief target is within reach of this evidence')
  assert.ok(500 - 176 > 300, 'the old global target never was')
})

/* ── format selection ─────────────────────────────────────────────────────── */

test('a single thin source yields a brief', () => {
  assert.equal(selectArticleFormat({ claims: claims(3), evidence: evidence(1), importance: 5 }).format, 'brief')
})

test('corroborated detail yields a standard', () => {
  const decision = selectArticleFormat({
    claims: claims(7),
    evidence: evidence(2, ['Vendor', 'TechPress']),
    importance: 6,
  })
  assert.equal(decision.format, 'standard')
  assert.equal(decision.targetMinWords, 500)
})

test('deep, widely corroborated, important evidence yields an analysis', () => {
  const decision = selectArticleFormat({
    claims: claims(14),
    evidence: evidence(3, ['Vendor', 'TechPress', 'Verge']),
    importance: 8,
  })
  assert.equal(decision.format, 'analysis')
  assert.equal(decision.targetMaxWords, 1400)
})

test('many claims from one publisher cannot buy a longer format', async (t) => {
  // Volume is not depth. Twenty claims from a single press release is still one
  // source's account of events.
  await t.test('stays brief on one source', () => {
    assert.equal(
      selectArticleFormat({ claims: claims(20), evidence: evidence(1), importance: 9 }).format,
      'brief',
    )
  })
  await t.test('duplicate publishers do not count as independent', () => {
    const decision = selectArticleFormat({
      claims: claims(20),
      evidence: evidence(3, ['Vendor', 'Vendor', 'Vendor']),
      importance: 9,
    })
    assert.equal(decision.signals.independentPublishers, 1)
    assert.equal(decision.format, 'brief')
  })
})

test('weakly supported claims cannot buy a longer format', () => {
  // Only verified claims count toward depth, or the format becomes a way to
  // launder thin sourcing into length.
  const decision = selectArticleFormat({
    claims: claims(1, 20, 5),
    evidence: evidence(3, ['A', 'B', 'C']),
    importance: 9,
  })
  assert.equal(decision.signals.substantiveClaims, 1)
  assert.equal(decision.signals.singleSourceClaims, 20)
  assert.equal(decision.format, 'brief')
})

test('an unimportant story cannot reach analysis however well sourced', () => {
  const decision = selectArticleFormat({
    claims: claims(20),
    evidence: evidence(4, ['A', 'B', 'C', 'D']),
    importance: 3,
  })
  assert.equal(decision.format, 'standard', 'depth without significance is not an analysis')
})

test('no evidence at all still yields a usable decision', () => {
  const decision = selectArticleFormat({ claims: [], evidence: [], importance: 0 })
  assert.equal(decision.format, 'brief')
  assert.equal(decision.signals.substantiveClaims, 0)
})

/* ── decisions are explainable and persistable ────────────────────────────── */

test('every decision carries a non-sensitive reason and its signals', () => {
  const decision = selectArticleFormat({
    claims: claims(7),
    evidence: evidence(2, ['Vendor', 'TechPress']),
    importance: 6,
  })
  assert.match(decision.reason, /standard/)
  assert.match(decision.reason, /7 verified claim/)
  assert.ok(!decision.reason.includes('http'), 'the reason must not embed source URLs')
  assert.equal(decision.signals.evidenceSources, 2)
})

test('format ranges are ordered and do not overlap downward', () => {
  assert.ok(ARTICLE_FORMATS.brief.maxWords < ARTICLE_FORMATS.standard.minWords)
  assert.ok(ARTICLE_FORMATS.standard.maxWords <= ARTICLE_FORMATS.analysis.minWords)
  for (const [name, range] of Object.entries(ARTICLE_FORMATS)) {
    assert.ok(range.minWords < range.maxWords, `${name} range must be non-empty`)
  }
})

test('a persisted format round-trips, and pre-format rows default to standard', () => {
  assert.equal(toArticleFormat('brief'), 'brief')
  assert.equal(toArticleFormat('analysis'), 'analysis')
  // Rows written before the format column existed were judged against 500-900.
  assert.equal(toArticleFormat(undefined), 'standard')
  assert.equal(toArticleFormat(null), 'standard')
  assert.equal(toArticleFormat('novella'), 'standard')
})

test('formatRange never returns undefined for a stored value', () => {
  for (const value of ['brief', 'standard', 'analysis', 'garbage', '']) {
    const range = formatRange(toArticleFormat(value))
    assert.ok(range.minWords > 0 && range.maxWords > range.minWords)
  }
})
