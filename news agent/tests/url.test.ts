import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalizeUrl,
  isBannedDomain,
  registrableDomain,
  urlHost,
} from '../src/dedupe/url.ts'

/*
 * URL canonicalization is the level-2 dedupe key, so it gets the largest table
 * in the suite. Each case documents a class of difference that must NOT produce
 * two keys for one document, or must produce two keys for two documents.
 */

test('canonicalizeUrl collapses differences that do not select a document', async (t) => {
  const equivalent: Array<[string, string, string]> = [
    ['scheme', 'http://openai.com/index', 'https://openai.com/index'],
    ['www prefix', 'https://www.openai.com/news', 'https://openai.com/news'],
    ['m prefix', 'https://m.theverge.com/a', 'https://theverge.com/a'],
    ['amp subdomain', 'https://amp.cnn.com/x', 'https://cnn.com/x'],
    ['host casing', 'https://OpenAI.COM/News', 'https://openai.com/news'],
    ['trailing slash', 'https://openai.com/news/', 'https://openai.com/news'],
    ['duplicate slashes', 'https://openai.com//news//x', 'https://openai.com/news/x'],
    ['fragment', 'https://openai.com/news#section-2', 'https://openai.com/news'],
    ['default port', 'https://openai.com:443/news', 'https://openai.com/news'],
    ['http default port', 'http://openai.com:80/news', 'https://openai.com/news'],
    ['utm params', 'https://openai.com/news?utm_source=x&utm_medium=y', 'https://openai.com/news'],
    ['ref param', 'https://techcrunch.com/a?ref=hn', 'https://techcrunch.com/a'],
    ['fbclid', 'https://theverge.com/a?fbclid=abc123', 'https://theverge.com/a'],
    ['mixed tracking', 'https://x.com/a?utm_campaign=c&fbclid=b&gclid=d', 'https://x.com/a'],
    ['amp suffix', 'https://theverge.com/a/amp', 'https://theverge.com/a'],
    ['index.html', 'https://example.org/blog/index.html', 'https://example.org/blog'],
    ['path casing', 'https://openai.com/News/GPT', 'https://openai.com/news/gpt'],
    ['trailing root dot', 'https://openai.com./news', 'https://openai.com/news'],
  ]

  for (const [label, a, b] of equivalent) {
    await t.test(label, () => {
      assert.equal(
        canonicalizeUrl(a),
        canonicalizeUrl(b),
        `${a} and ${b} should share a canonical key`,
      )
    })
  }
})

test('canonicalizeUrl preserves differences that DO select a document', async (t) => {
  const distinct: Array<[string, string, string]> = [
    ['different path', 'https://openai.com/news/a', 'https://openai.com/news/b'],
    ['different host', 'https://openai.com/news', 'https://anthropic.com/news'],
    ['meaningful query', 'https://example.org/post?id=1', 'https://example.org/post?id=2'],
    ['page param', 'https://example.org/list?page=1', 'https://example.org/list?page=2'],
    ['subdomain', 'https://blog.example.org/a', 'https://docs.example.org/a'],
    ['non-default port', 'https://example.org:8443/a', 'https://example.org/a'],
  ]

  for (const [label, a, b] of distinct) {
    await t.test(label, () => {
      assert.notEqual(canonicalizeUrl(a), canonicalizeUrl(b), `${a} and ${b} must stay distinct`)
    })
  }
})

test('canonicalizeUrl sorts retained query params so order cannot fork a key', () => {
  assert.equal(
    canonicalizeUrl('https://example.org/p?b=2&a=1'),
    canonicalizeUrl('https://example.org/p?a=1&b=2'),
  )
})

test('canonicalizeUrl unwraps a known redirect wrapper', () => {
  assert.equal(
    canonicalizeUrl('https://news.google.com/rss/articles/xyz?url=https%3A%2F%2Fopenai.com%2Fnews'),
    'https://openai.com/news',
  )
})

test('canonicalizeUrl does not recurse indefinitely on nested wrappers', () => {
  const nested =
    'https://news.google.com/x?url=' +
    encodeURIComponent('https://news.google.com/y?url=' + encodeURIComponent('https://openai.com/z'))
  // One level of unwrapping; the result is still a stable, non-throwing key.
  const result = canonicalizeUrl(nested)
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
})

test('canonicalizeUrl returns a stable key for unparseable input', () => {
  assert.equal(canonicalizeUrl('not a url'), 'not a url')
  assert.equal(canonicalizeUrl('  '), '')
  assert.equal(canonicalizeUrl('mailto:a@b.com'), 'mailto:a@b.com')
})

test('canonicalizeUrl is idempotent', () => {
  const once = canonicalizeUrl('https://www.Example.com/News/?utm_source=x#frag')
  assert.equal(canonicalizeUrl(once), once)
})

test('urlHost and registrableDomain', () => {
  assert.equal(urlHost('https://www.theverge.com/a'), 'theverge.com')
  assert.equal(registrableDomain('https://blog.google/technology/ai/'), 'blog.google')
  assert.equal(registrableDomain('https://deepmind.google/blog/x'), 'deepmind.google')
  assert.equal(registrableDomain('https://www.bbc.co.uk/news'), 'bbc.co.uk')
  assert.equal(registrableDomain('not-a-url'), '')
})

test('isBannedDomain matches host and subdomains only', () => {
  const banned = ['medium.com', 'news.google.com']
  assert.equal(isBannedDomain('https://medium.com/@a/post', banned), true)
  assert.equal(isBannedDomain('https://blog.medium.com/x', banned), true)
  assert.equal(isBannedDomain('https://news.google.com/x', banned), true)
  assert.equal(isBannedDomain('https://openai.com/news', banned), false)
  // A domain that merely ends with the same letters must not match.
  assert.equal(isBannedDomain('https://notmedium.com/x', banned), false)
})
