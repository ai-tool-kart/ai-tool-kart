/*
 * Automation validation — SPEC-automations.md §3, slice 1.
 *
 * Mirrors tests/catalogue.test.ts's shape: schema-level cases against
 * AutomationSchema directly, then parseAutomations's throw-collected
 * behaviour the same way "JsonToolCatalogue fails loudly on invalid data"
 * exercises parseCatalogue.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AutomationSchema,
  AutomationStepSchema,
  AutomationToolSchema,
  parseAutomations,
} from '../src/automations/schema.ts'
import { makeAutomation } from './helpers.ts'

await test('AutomationSchema', async (t) => {
  await t.test('a valid record parses', () => {
    const result = AutomationSchema.safeParse(makeAutomation())
    assert.equal(result.success, true)
  })

  await t.test('a valid record with an authored step parses', () => {
    const result = AutomationSchema.safeParse(
      makeAutomation({
        steps: [{ title: 'Open the tool', body: 'Go to the site and sign in.' }],
      }),
    )
    assert.equal(result.success, true)
  })

  const REQUIRED_FIELDS: Array<keyof ReturnType<typeof makeAutomation>> = [
    'id',
    'slug',
    'kind',
    'niche',
    'persona',
    'title',
    'intentLabels',
    'tools',
    'workflowSummary',
    'samplePrompt',
    'beginnerFriendly',
    'trustScore',
    'pricingNote',
    'pricingTier',
    'pricingTierSource',
    'sourceUrl',
    'sourceType',
    'freshness',
    'batch',
    'status',
  ]

  for (const field of REQUIRED_FIELDS) {
    await t.test(`missing "${field}" fails`, () => {
      const record: Record<string, unknown> = { ...makeAutomation() }
      delete record[field]
      assert.equal(AutomationSchema.safeParse(record).success, false, field)
    })
  }

  await t.test('an unknown top-level key is rejected by .strict()', () => {
    const result = AutomationSchema.safeParse({ ...makeAutomation(), exfiltrate: true })
    assert.equal(result.success, false)
  })

  await t.test('an unknown key inside a tool is rejected by .strict()', () => {
    const record: unknown = {
      ...makeAutomation(),
      tools: [{ name: 'X', url: 'https://example.com', runCommand: 'rm -rf /' }],
    }
    assert.equal(AutomationSchema.safeParse(record).success, false)
  })

  await t.test('an unknown key inside a step is rejected by .strict()', () => {
    const record: unknown = {
      ...makeAutomation(),
      steps: [{ title: 'X', body: 'Y', webhook: 'https://evil.example' }],
    }
    assert.equal(AutomationSchema.safeParse(record).success, false)
  })

  await t.test('a pricingTierSource outside matched/default fails', () => {
    const record: unknown = { ...makeAutomation(), pricingTierSource: 'guessed' }
    assert.equal(AutomationSchema.safeParse(record).success, false)
  })

  await t.test('a kind outside CATALOGUE_KINDS fails', () => {
    for (const kind of ['all', 'MCP', '', 'automation']) {
      const record: unknown = { ...makeAutomation(), kind }
      assert.equal(AutomationSchema.safeParse(record).success, false, kind)
    }
  })

  await t.test('both kinds are legal', () => {
    for (const kind of ['workflow', 'mcp'] as const) {
      assert.equal(AutomationSchema.safeParse(makeAutomation({ kind })).success, true, kind)
    }
  })

  await t.test('a niche outside the taxonomy fails', () => {
    const record: unknown = { ...makeAutomation(), niche: 'Restaurant Owners' }
    assert.equal(AutomationSchema.safeParse(record).success, false)
  })

  await t.test('a pricingTier outside the taxonomy fails', () => {
    const result = AutomationSchema.safeParse({ ...makeAutomation(), pricingTier: 'enterprise' })
    assert.equal(result.success, false)
  })

  await t.test('a beginnerFriendly value outside the enum fails', () => {
    const result = AutomationSchema.safeParse({ ...makeAutomation(), beginnerFriendly: 'kinda' })
    assert.equal(result.success, false)
  })

  await t.test('a status value outside the enum fails', () => {
    const result = AutomationSchema.safeParse({ ...makeAutomation(), status: 'archived' })
    assert.equal(result.success, false)
  })

  await t.test('a trustScore outside 1-5 fails', () => {
    assert.equal(AutomationSchema.safeParse({ ...makeAutomation(), trustScore: 0 }).success, false)
    assert.equal(AutomationSchema.safeParse({ ...makeAutomation(), trustScore: 6 }).success, false)
  })

  await t.test('an empty intentLabels array fails', () => {
    const result = AutomationSchema.safeParse(makeAutomation({ intentLabels: [] }))
    assert.equal(result.success, false)
  })

  await t.test('an empty tools array fails', () => {
    const result = AutomationSchema.safeParse(makeAutomation({ tools: [] }))
    assert.equal(result.success, false)
  })

  await t.test('a tool url without http(s) fails', () => {
    const result = AutomationSchema.safeParse(
      makeAutomation({ tools: [{ name: 'X', url: 'not-a-url' }] }),
    )
    assert.equal(result.success, false)
  })

  await t.test('a tool url with embedded credentials fails', () => {
    const result = AutomationSchema.safeParse(
      makeAutomation({ tools: [{ name: 'X', url: 'https://user:pass@example.com' }] }),
    )
    assert.equal(result.success, false)
  })

  await t.test('an uppercase catalogueSlug fails, matching the slug pattern', () => {
    const result = AutomationSchema.safeParse(
      makeAutomation({ tools: [{ name: 'X', url: 'https://example.com', catalogueSlug: 'Not-A-Slug' }] }),
    )
    assert.equal(result.success, false)
  })

  await t.test('the two vocabulary values from SPEC-automations.md §4 are both legal', () => {
    for (const niche of ['Students', 'Customer Support Teams'] as const) {
      assert.equal(AutomationSchema.safeParse(makeAutomation({ niche })).success, true, niche)
    }
  })
})

await test('AutomationToolSchema and AutomationStepSchema standalone', async (t) => {
  await t.test('a minimal tool (name + url only) parses', () => {
    assert.equal(
      AutomationToolSchema.safeParse({ name: 'Motion', url: 'https://usemotion.com' }).success,
      true,
    )
  })

  await t.test('a tool with a name and no url parses — later tools in a row have none', () => {
    assert.equal(AutomationToolSchema.safeParse({ name: 'Rippling' }).success, true)
  })

  await t.test('a tool url, when present, must still be http(s)', () => {
    assert.equal(AutomationToolSchema.safeParse({ name: 'X', url: 'ftp://x.example' }).success, false)
  })

  await t.test('a minimal step (title + body only) parses', () => {
    assert.equal(
      AutomationStepSchema.safeParse({ title: 'Open the tool', body: 'Sign in.' }).success,
      true,
    )
  })

  await t.test('a step missing body fails', () => {
    assert.equal(AutomationStepSchema.safeParse({ title: 'Open the tool' }).success, false)
  })
})

await test('parseAutomations fails loudly on invalid data', async (t) => {
  await t.test('a valid file parses', () => {
    const result = parseAutomations([makeAutomation()], { origin: 'test' })
    assert.equal(result.length, 1)
  })

  await t.test('a bad field names the record and the path', () => {
    assert.throws(
      () =>
        parseAutomations(
          [{ ...makeAutomation({ id: 'broken-automation' }), niche: 'Nowhere' }],
          { origin: 'test' },
        ),
      (error: Error) => {
        assert.match(error.message, /broken-automation/, 'the offending record must be named')
        assert.match(error.message, /niche/, 'the failing field path must be named')
        return true
      },
    )
  })

  await t.test('a record with no id is located by index', () => {
    assert.throws(
      () => parseAutomations([{ title: 'Nameless task' }], { origin: 'test' }),
      /\[0\] title="Nameless task"/,
    )
  })

  await t.test('every problem is reported, not just the first', () => {
    try {
      parseAutomations(
        [
          { ...makeAutomation({ id: 'first-bad' }), trustScore: 99 },
          { ...makeAutomation({ id: 'second-bad' }), pricingTier: 'enterprise' },
        ],
        { origin: 'test' },
      )
      assert.fail('expected parseAutomations to throw')
    } catch (error) {
      const message = (error as Error).message
      assert.match(message, /first-bad/)
      assert.match(message, /second-bad/, 'a second broken record must not be hidden')
    }
  })

  await t.test('a bad record is never silently dropped', () => {
    assert.throws(
      () =>
        parseAutomations(
          [makeAutomation({ id: 'fine-automation' }), { id: 'rotten', title: 'Rotten' }],
          { origin: 'test' },
        ),
      /rotten/,
    )
  })

  await t.test('duplicate ids fail the load', () => {
    assert.throws(
      () =>
        parseAutomations(
          [
            makeAutomation({ id: 'twin', slug: 'twin-a' }),
            makeAutomation({ id: 'twin', slug: 'twin-b' }),
          ],
          { origin: 'test' },
        ),
      /duplicate/,
    )
  })

  await t.test('duplicate slugs fail the load', () => {
    assert.throws(
      () =>
        parseAutomations(
          [makeAutomation({ id: 'a', slug: 'same' }), makeAutomation({ id: 'b', slug: 'same' })],
          { origin: 'test' },
        ),
      /duplicate/,
    )
  })

  await t.test('a non-array input fails with a clear message', () => {
    assert.throws(
      () => parseAutomations({ automations: [] }, { origin: 'test' }),
      /must be a JSON array/,
    )
  })
})
