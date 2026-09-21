/*
 * review/slug.ts — slugify, truncation and collision suffixing.
 *
 * `slugify` is checked against real catalogue records so a regression here
 * would actually change what a familiar tool's slug looks like, not just
 * fail an abstract assertion.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { slugify, truncateSlug, uniqueSlug } from '../src/review/slug.ts'

await test('slugify', async (t) => {
  await t.test('matches real catalogue slugs', () => {
    assert.equal(slugify('Notion AI'), 'notion-ai')
    assert.equal(slugify('GitHub Copilot'), 'github-copilot')
    assert.equal(slugify('v0'), 'v0')
    assert.equal(slugify('Claude Code'), 'claude-code')
  })

  await t.test('collapses runs of punctuation and whitespace to one hyphen', () => {
    assert.equal(slugify('Foo & Bar!!  Baz'), 'foo-bar-baz')
  })

  await t.test('strips leading/trailing hyphens', () => {
    assert.equal(slugify('  --Weird Name--  '), 'weird-name')
  })

  await t.test('a name with no alphanumeric characters falls back rather than returning empty', () => {
    assert.equal(slugify('!!!'), 'untitled')
  })
})

await test('truncateSlug', async (t) => {
  await t.test('leaves a short slug untouched', () => {
    assert.equal(truncateSlug('claude-code', 64), 'claude-code')
  })

  await t.test('cuts at the last hyphen at or before the limit', () => {
    // 'aaaa-bbbb-cccc-dddd' truncated to 14 chars is 'aaaa-bbbb-ccc' before
    // the hyphen cut, so it should back up to the previous hyphen boundary.
    const slug = 'aaaa-bbbb-cccc-dddd'
    const truncated = truncateSlug(slug, 14)
    assert.ok(truncated.length <= 14)
    assert.equal(truncated, 'aaaa-bbbb')
  })

  await t.test('hard-cuts a single word with no hyphen to fall back on', () => {
    const slug = 'a'.repeat(80)
    const truncated = truncateSlug(slug, 10)
    assert.equal(truncated.length, 10)
    assert.equal(truncated, 'a'.repeat(10))
  })

  await t.test('never leaves a trailing hyphen', () => {
    const truncated = truncateSlug('abcde-fghij-klmno', 11)
    assert.ok(!truncated.endsWith('-'))
  })
})

await test('uniqueSlug', async (t) => {
  await t.test('returns the base slug untouched when nothing collides', () => {
    assert.equal(uniqueSlug('claude-code', new Set()), 'claude-code')
  })

  await t.test('suffixes -2 on a single collision', () => {
    assert.equal(uniqueSlug('claude-code', new Set(['claude-code'])), 'claude-code-2')
  })

  await t.test('walks up the suffix until a free one is found', () => {
    const existing = new Set(['claude-code', 'claude-code-2', 'claude-code-3'])
    assert.equal(uniqueSlug('claude-code', existing), 'claude-code-4')
  })

  await t.test('the suffixed form still respects maxLength', () => {
    const longBase = 'a'.repeat(70)
    const existing = new Set([truncateSlug(longBase, 64)])
    const result = uniqueSlug(longBase, existing, 64)
    assert.ok(result.length <= 64, `expected length <= 64, got ${result.length}`)
    assert.ok(result.endsWith('-2'))
  })
})
