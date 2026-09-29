/*
 * Related guides — the internal-link graph between guide pages.
 *
 * The unit block pins selectRelated's rules on fixtures. The catalogue block
 * runs the real selection over every imported guide, exactly as the detail
 * route does, and holds the property the selection exists for: no guide is
 * orphaned — every one is linked from at least two others.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJsonAutomations } from '../src/automations/json.ts'
import { createAutomationMatcher } from '../src/automations/match.ts'
import { RELATED_NEIGHBOURS, selectRelated } from '../src/automations/related.ts'
import { AUTOMATIONS } from '../src/config/limits.ts'
import { makeAutomation } from './helpers.ts'

const guide = (i: number) => makeAutomation({ id: `g${i}`, slug: `guide-${i}`, niche: 'Students' })
const g0 = guide(0)
const g1 = guide(1)
const g2 = guide(2)
const g3 = guide(3)
const g4 = guide(4)
const g5 = guide(5)
const g6 = guide(6)
const g7 = guide(7)
const niche = [g0, g1, g2, g3, g4, g5, g6, g7]
const ids = (list: { id: string }[]) => list.map((item) => item.id)

await test('selectRelated', async (t) => {
  await t.test('curated first, then relevance, with the next two in the niche kept', () => {
    const result = selectRelated({ automation: g0, curated: [g5], niche, ranked: [g7, g6, g3, g4], limit: 6 })
    assert.deepEqual(ids(result), ['g5', 'g7', 'g6', 'g3', 'g1', 'g2'])
  })

  await t.test('never the guide itself, never twice, never a draft', () => {
    const draft = makeAutomation({ id: 'd', slug: 'draft', niche: 'Students', status: 'draft' })
    const result = selectRelated({ automation: g0, curated: [g0, draft, g3, g3], niche, ranked: [g0, g3, g3, g4], limit: 6 })
    assert.equal(new Set(ids(result)).size, result.length)
    assert.ok(!ids(result).includes('g0'))
    assert.ok(!ids(result).includes('d'))
  })

  await t.test('neighbours wrap around the end of the niche', () => {
    const result = selectRelated({ automation: g7, curated: [], niche, ranked: [], limit: 6 })
    assert.deepEqual(ids(result).slice(0, 2), ['g0', 'g1'])
  })

  await t.test('relevance cannot crowd out the neighbours', () => {
    const result = selectRelated({ automation: g2, curated: [], niche, ranked: [g0, g1, g5, g6, g7, g4], limit: 4 })
    assert.ok(ids(result).includes('g3') && ids(result).includes('g4'), ids(result).join())
    assert.equal(result.length, 4)
  })

  await t.test('a niche smaller than the limit returns everyone else, no padding', () => {
    const small = [g0, g1, g2]
    assert.deepEqual(ids(selectRelated({ automation: g1, curated: [], niche: small, ranked: [], limit: 6 })).sort(), ['g0', 'g2'])
  })
})

await test('related guides across the real catalogue', async (t) => {
  const repo = createJsonAutomations()
  const all = await repo.list()
  const matcher = createAutomationMatcher(all)
  const inbound = new Map<string, number>(all.map((a) => [a.id, 0]))
  const problems: string[] = []

  for (const automation of all) {
    const nicheList = await repo.listByNiche(automation.niche)
    const ranked = matcher
      .match(automation.title, { niche: automation.niche, limit: AUTOMATIONS.maxRelatedGuides * 2 })
      .map((m) => m.automation)
    const curated = await Promise.all(
      (automation.relatedGuides ?? []).map((ref) => repo.findBySlug(ref.niche, ref.slug)),
    )
    const related = selectRelated({ automation, curated, niche: nicheList, ranked, limit: AUTOMATIONS.maxRelatedGuides })

    const expected = Math.min(AUTOMATIONS.maxRelatedGuides, nicheList.length - 1)
    if (related.length !== expected) problems.push(`${automation.id}: ${related.length} related, expected ${expected}`)
    if (related.some((r) => r.id === automation.id)) problems.push(`${automation.id}: links to itself`)
    if (new Set(related.map((r) => r.id)).size !== related.length) problems.push(`${automation.id}: duplicate`)
    for (const r of related) {
      if (r.status !== 'active') problems.push(`${automation.id}: links to inactive ${r.id}`)
      if (!r.title.trim()) problems.push(`${automation.id}: links to untitled ${r.id}`)
      inbound.set(r.id, (inbound.get(r.id) ?? 0) + 1)
    }
  }

  await t.test('every guide gets a full, valid, deduplicated set', () => {
    assert.deepEqual(problems.slice(0, 10), [])
  })

  await t.test(`no guide is orphaned — each has at least ${RELATED_NEIGHBOURS} inbound links`, () => {
    const orphans = [...inbound].filter(([, count]) => count < RELATED_NEIGHBOURS)
    assert.deepEqual(orphans.slice(0, 10), [], `${orphans.length} guides under ${RELATED_NEIGHBOURS} inbound links`)
  })

  await t.test('links are spread, not concentrated on a few guides', () => {
    const max = Math.max(...inbound.values())
    assert.ok(max <= 40, `one guide receives ${max} inbound related links`)
  })
})
