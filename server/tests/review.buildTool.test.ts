/*
 * review/buildTool.ts — submission → tool, pure.
 *
 * Every fixed rule from the review-script decisions gets its own assertion
 * here: id === slug, status 'active', verified false, addedAt = the injected
 * `today` (never the submission's own createdAt), the NOT_RECORDED sentinel
 * on the five spec fields, rating/reviews 0, trend/badge '', isMcpServer
 * absent rather than false.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { NOT_RECORDED } from '../src/catalogue/taxonomy.ts'
import { buildTool, type ReviewedFields } from '../src/review/buildTool.ts'
import type { Submission } from '../src/submissions/types.ts'
import { makeSubmission } from './helpers.ts'

function makeStoredSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...makeSubmission(),
    ...overrides,
  }
}

const FIELDS: ReviewedFields = {
  mono: 'Fx',
  slug: 'fixture-tool',
  price: '—',
  pop: 40,
  roles: ['Developer'],
  stages: ['build'],
  useCases: ['Draft an article'],
  tags: ['writing'],
  summary: 'A fixture tool used to exercise the review script mapping in tests.',
}

await test('buildTool', async (t) => {
  await t.test('direct fields come straight from the submission', () => {
    const submission = makeStoredSubmission({ name: 'Nova Write', tagline: 'Write faster', siteUrl: 'https://nova.example' })
    const tool = buildTool(submission, FIELDS, '2026-09-21')
    assert.equal(tool.name, 'Nova Write')
    assert.equal(tool.tagline, 'Write faster')
    assert.equal(tool.url, 'https://nova.example')
  })

  await t.test('id equals slug', () => {
    const tool = buildTool(makeStoredSubmission(), FIELDS, '2026-09-21')
    assert.equal(tool.id, tool.slug)
    assert.equal(tool.id, 'fixture-tool')
  })

  await t.test('status active, verified false, addedAt is the injected review date, not the submission date', () => {
    const submission = makeStoredSubmission({ createdAt: '2020-01-01T00:00:00.000Z' })
    const tool = buildTool(submission, FIELDS, '2026-09-21')
    assert.equal(tool.status, 'active')
    assert.equal(tool.verified, false)
    assert.equal(tool.addedAt, '2026-09-21')
  })

  await t.test('rating, reviews, trend and badge match the seeded "not assessed" convention', () => {
    const tool = buildTool(makeStoredSubmission(), FIELDS, '2026-09-21')
    assert.equal(tool.rating, 0)
    assert.equal(tool.reviews, 0)
    assert.equal(tool.trend, '')
    assert.equal(tool.badge, '')
  })

  await t.test('api/ctx/team/trial/integr all carry the NOT_RECORDED sentinel', () => {
    const tool = buildTool(makeStoredSubmission(), FIELDS, '2026-09-21')
    assert.equal(tool.api, NOT_RECORDED)
    assert.equal(tool.ctx, NOT_RECORDED)
    assert.equal(tool.team, NOT_RECORDED)
    assert.equal(tool.trial, NOT_RECORDED)
    assert.equal(tool.integr, NOT_RECORDED)
  })

  await t.test('isMcpServer is absent, not false', () => {
    const tool = buildTool(makeStoredSubmission(), FIELDS, '2026-09-21')
    assert.equal('isMcpServer' in tool, false)
  })

  await t.test('pricingTier is derived from pricingModel, not carried in fields', () => {
    const free = buildTool(makeStoredSubmission({ pricingModel: 'Free' }), FIELDS, '2026-09-21')
    assert.equal(free.pricingTier, 'free')

    const freemium = buildTool(makeStoredSubmission({ pricingModel: 'Freemium' }), FIELDS, '2026-09-21')
    assert.equal(freemium.pricingTier, 'freemium')

    const credits = buildTool(makeStoredSubmission({ pricingModel: 'Credits' }), FIELDS, '2026-09-21')
    assert.equal(credits.pricingTier, 'paid')
  })

  await t.test('the reviewer-confirmed fields all land on the tool untouched', () => {
    const tool = buildTool(makeStoredSubmission(), FIELDS, '2026-09-21')
    assert.equal(tool.mono, 'Fx')
    assert.equal(tool.price, '—')
    assert.equal(tool.pop, 40)
    assert.deepEqual(tool.roles, ['Developer'])
    assert.deepEqual(tool.stages, ['build'])
    assert.deepEqual(tool.useCases, ['Draft an article'])
    assert.deepEqual(tool.tags, ['writing'])
    assert.equal(tool.summary, FIELDS.summary)
  })
})
