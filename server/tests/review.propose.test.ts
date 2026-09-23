/*
 * review/propose.ts — the per-field defaults the reviewer sees and can
 * overwrite. Each one encodes a real review-script decision; this file
 * pins the decision, not just "the function returns a string".
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { NOT_RECORDED } from '../src/catalogue/taxonomy.ts'
import { PROPOSED_POP, pricingTierFor, proposeMono, proposePrice, proposeRoles, proposeSummary, proposeTags } from '../src/review/propose.ts'

await test('proposeMono', async (t) => {
  await t.test('first letter upper, second letter lower', () => {
    assert.equal(proposeMono('Claude'), 'Cl')
    assert.equal(proposeMono('grammarly'), 'Gr')
  })

  await t.test('a digit second character has no case, and is left as-is', () => {
    assert.equal(proposeMono('v0'), 'V0')
  })

  await t.test('always exactly two characters, even for a one-character name', () => {
    const mono = proposeMono('X')
    assert.equal(mono.length, 2)
  })
})

await test('proposePrice', async (t) => {
  await t.test('the submission price, trimmed, when present', () => {
    assert.equal(proposePrice('  Free tier + paid plans  '), 'Free tier + paid plans')
  })

  await t.test('NOT_RECORDED when absent or blank', () => {
    assert.equal(proposePrice(undefined), NOT_RECORDED)
    assert.equal(proposePrice('   '), NOT_RECORDED)
    assert.equal(proposePrice(''), NOT_RECORDED)
  })
})

await test('PROPOSED_POP', () => {
  assert.equal(PROPOSED_POP, 40)
})

await test('proposeSummary', async (t) => {
  await t.test('a description already under the target is returned whole, just trimmed', () => {
    assert.equal(proposeSummary('  A short description.  '), 'A short description.')
  })

  await t.test('cuts at a sentence boundary near the target when one exists nearby', () => {
    const sentence = 'A capable writing assistant for marketing teams who need to ship copy fast.'
    const filler = ' It integrates with the usual tools and supports every major browser besides.'
    const description = sentence + filler + filler
    const summary = proposeSummary(description, 80)
    assert.equal(summary, sentence)
  })

  await t.test('falls back to a word boundary when no sentence end is nearby', () => {
    const description = Array.from({ length: 50 }, (_unused, i) => `word${i}`).join(' ')
    const summary = proposeSummary(description, 40)
    assert.ok(summary.length <= 45, `expected roughly 40 chars, got ${summary.length}`)
    assert.ok(!summary.endsWith(' '))
  })

  await t.test('never exceeds the description itself', () => {
    const short = 'Short.'
    assert.equal(proposeSummary(short, 300), short)
  })
})

await test('proposeRoles', async (t) => {
  await t.test('matches a role from free-text audience via ROLE_KEYWORDS', () => {
    assert.deepEqual(proposeRoles('Solo developers and engineers'), ['Developer'])
  })

  await t.test('can match more than one role', () => {
    const roles = proposeRoles('Marketers and content creators')
    assert.ok(roles.includes('Marketer'))
    assert.ok(roles.includes('Content Creator'))
  })

  await t.test('no match, or no audience at all, proposes an empty list', () => {
    assert.deepEqual(proposeRoles('Rocks and minerals enthusiasts'), [])
    assert.deepEqual(proposeRoles(undefined), [])
  })
})

await test('proposeTags', async (t) => {
  await t.test('prefills from the submission tags when present', () => {
    assert.deepEqual(proposeTags(['writing', 'ai'], 'Writing'), ['writing', 'ai'])
  })

  await t.test('falls back to the category when the submission has none', () => {
    assert.deepEqual(proposeTags([], 'Writing'), ['Writing'])
  })
})

await test('pricingTierFor', async (t) => {
  await t.test('maps every pricing model to its one legal tier', () => {
    assert.equal(pricingTierFor('Free'), 'free')
    assert.equal(pricingTierFor('Freemium'), 'freemium')
    assert.equal(pricingTierFor('Subscription'), 'paid')
    assert.equal(pricingTierFor('Credits'), 'paid')
    assert.equal(pricingTierFor('Usage-based'), 'paid')
  })
})
