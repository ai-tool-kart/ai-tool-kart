/*
 * normalizeUrl — SPEC-submit-backend.md §5.
 *
 * Pure function, no I/O, so every case is exercised directly rather than
 * through a request. This is the comparison key the duplicate-submission
 * check (a later slice) is built on, so a silent regression here would show
 * up as either missed duplicates or false ones — not as a crash.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUrl } from '../src/submissions/normalizeUrl.ts'

await test('normalizeUrl', async (t) => {
  await t.test('the spec\'s own worked example', () => {
    assert.equal(normalizeUrl('https://WWW.Example.com/?utm_source=x#top'), 'example.com')
  })

  await t.test('step 1 — trims surrounding whitespace', () => {
    assert.equal(normalizeUrl('   https://example.com  '), 'example.com')
  })

  await t.test('step 3 — lowercases the hostname', () => {
    assert.equal(normalizeUrl('https://EXAMPLE.COM'), 'example.com')
  })

  await t.test('step 4 — strips a leading www., and only a leading one', () => {
    assert.equal(normalizeUrl('https://www.example.com'), 'example.com')
    assert.equal(normalizeUrl('https://www.wwwexample.com'), 'wwwexample.com')
  })

  await t.test('step 5 — http and https collide', () => {
    assert.equal(normalizeUrl('http://example.com'), normalizeUrl('https://example.com'))
    assert.equal(normalizeUrl('http://example.com'), 'example.com')
  })

  await t.test('step 6 — drops the fragment', () => {
    assert.equal(normalizeUrl('https://example.com/page#section-2'), 'example.com/page')
  })

  await t.test('step 7 — drops utm_*, ref, fbclid, gclid; keeps everything else', () => {
    assert.equal(normalizeUrl('https://example.com/?utm_source=x&utm_medium=y'), 'example.com')
    assert.equal(normalizeUrl('https://example.com/?ref=abc'), 'example.com')
    assert.equal(normalizeUrl('https://example.com/?fbclid=abc'), 'example.com')
    assert.equal(normalizeUrl('https://example.com/?gclid=abc'), 'example.com')
    assert.equal(
      normalizeUrl('https://example.com/?utm_source=x&keep=1&ref=y&also=2'),
      'example.com?also=2&keep=1',
    )
  })

  await t.test('step 8 — strips a trailing slash; a bare root becomes empty', () => {
    assert.equal(normalizeUrl('https://example.com/'), 'example.com')
    assert.equal(normalizeUrl('https://example.com'), 'example.com')
    assert.equal(normalizeUrl('https://example.com/tools/'), 'example.com/tools')
    assert.equal(normalizeUrl('https://example.com/tools'), 'example.com/tools')
  })

  await t.test('combined: messy real-world input', () => {
    assert.equal(
      normalizeUrl('  https://WWW.Example.com/Tools/?utm_campaign=fall&id=42#pricing  '),
      'example.com/Tools?id=42',
    )
  })

  await t.test('query params are sorted, so order in the source URL does not matter', () => {
    const a = normalizeUrl('https://example.com/?a=1&b=2')
    const b = normalizeUrl('https://example.com/?b=2&a=1')
    assert.equal(a, b)
    assert.equal(a, 'example.com?a=1&b=2')
  })

  await t.test('an empty surviving query collapses to no query at all, not "?"', () => {
    const result = normalizeUrl('https://example.com/?utm_source=x')
    assert.equal(result, 'example.com')
    assert.ok(!result.includes('?'))
  })

  await t.test('a default port for the scheme is dropped', () => {
    assert.equal(normalizeUrl('https://example.com:443/'), 'example.com')
  })

  await t.test('a non-default port is preserved — it may be a different origin', () => {
    assert.equal(normalizeUrl('https://example.com:8080'), 'example.com:8080')
  })

  await t.test('a subdomain is not merged into its parent domain', () => {
    const sub = normalizeUrl('https://sub.example.com')
    assert.equal(sub, 'sub.example.com')
    assert.notEqual(sub, normalizeUrl('https://example.com'))
  })

  await t.test('path case is preserved, not folded', () => {
    assert.equal(normalizeUrl('https://example.com/Tools'), 'example.com/Tools')
    assert.notEqual(normalizeUrl('https://example.com/Tools'), normalizeUrl('https://example.com/tools'))
  })
})
