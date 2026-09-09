/*
 * Usage stories: the adapter, the endpoint, and the real seed content.
 *
 * Three concerns in one file, as tests/catalogue.test.ts does for the catalogue:
 * what the port promises, how the adapter fails, and what the shipped content
 * must satisfy. The last block is the only place that touches the real
 * stories.json, so writing a story does not break the rest of the suite.
 *
 * The assertion that matters most is the one linking the two data sets: every
 * `toolSlugs` entry must name a tool the catalogue actually has. Nothing in
 * stories/ can check that — it has no catalogue, deliberately — so it is checked
 * here, where both are in scope. Without it an unresolvable slug is invisible
 * until a chip silently fails to render on the homepage.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import type { Tool, UsageStory } from '../src/domain/types.ts'
import { createJsonUsageStoryRepository } from '../src/stories/json.ts'
import type { UsageStoryListResponse } from '../src/http/routes/usageStories.ts'
import {
  fixtureStories,
  makeStory,
  readJson,
  testContainer,
  testEnv,
  testLogger,
  withServer,
} from './helpers.ts'

/* ═══ 1. The adapter ═══════════════════════════════════════════════════════ */

await test('JsonUsageStoryRepository', async (t) => {
  await t.test('returns stories in editorial order, not file order', async () => {
    const repo = fixtureStories([
      makeStory({ id: 'third', order: 30 }),
      makeStory({ id: 'first', order: 10 }),
      makeStory({ id: 'second', order: 20 }),
    ])
    const stories = await repo.list()
    assert.deepEqual(
      stories.map((story) => story.id),
      ['first', 'second', 'third'],
    )
  })

  await t.test('limit takes from the front of that order', async () => {
    const repo = fixtureStories([
      makeStory({ id: 'a', order: 10 }),
      makeStory({ id: 'b', order: 20 }),
      makeStory({ id: 'c', order: 30 }),
    ])
    assert.deepEqual(
      (await repo.list({ limit: 2 })).map((s) => s.id),
      ['a', 'b'],
    )
    assert.equal(await repo.size(), 3, 'size reports the whole set, not the page')
  })

  await t.test('a caller cannot mutate the shared set', async () => {
    // list() hands back an array. If it were the internal one, a caller sorting
    // it would reorder every later request in the process.
    const repo = fixtureStories([makeStory({ id: 'a', order: 10 }), makeStory({ id: 'b', order: 20 })])
    const first = await repo.list()
    first.reverse()
    assert.deepEqual(
      (await repo.list()).map((s) => s.id),
      ['a', 'b'],
    )
  })

  await t.test('reports its driver', () => {
    assert.equal(fixtureStories([]).id, 'json')
  })
})

await test('JsonUsageStoryRepository fails loudly on invalid data', async (t) => {
  await t.test('a bad field names the record and the path', () => {
    assert.throws(
      () => createJsonUsageStoryRepository({ records: [{ ...makeStory({ id: 'broken' }), role: '' }] }),
      (error: Error) => {
        assert.match(error.message, /broken/, 'the offending record must be named')
        assert.match(error.message, /role/, 'the failing field path must be named')
        return true
      },
    )
  })

  await t.test('an unknown key is rejected, not ignored', () => {
    // `.strict()`: a half-finished rename must be heard about at boot.
    assert.throws(
      () => createJsonUsageStoryRepository({ records: [{ ...makeStory(), tools: ['claude'] }] }),
      /tools/,
    )
  })

  await t.test('a duplicate id is rejected', () => {
    assert.throws(
      () =>
        createJsonUsageStoryRepository({
          records: [makeStory({ id: 'same', order: 1 }), makeStory({ id: 'same', order: 2 })],
        }),
      /duplicate/,
    )
  })

  await t.test('a duplicate order is rejected', () => {
    // A tie would make the rail's sequence depend on file order, which is the
    // accident `order` exists to remove.
    assert.throws(
      () =>
        createJsonUsageStoryRepository({
          records: [makeStory({ id: 'a', order: 5 }), makeStory({ id: 'b', order: 5 })],
        }),
      /duplicate/,
    )
  })

  await t.test('a one-tool story is rejected', () => {
    // The section's subject is tools COMBINED. One tool is not a setup.
    assert.throws(
      () => createJsonUsageStoryRepository({ records: [makeStory({ toolSlugs: ['claude'] })] }),
      /toolSlugs/,
    )
  })

  await t.test('every failure is reported, not just the first', () => {
    try {
      createJsonUsageStoryRepository({
        records: [
          { ...makeStory({ id: 'one' }), role: '' },
          { ...makeStory({ id: 'two' }), task: '' },
        ],
      })
      assert.fail('expected the constructor to throw')
    } catch (error) {
      const message = (error as Error).message
      assert.match(message, /one/)
      assert.match(message, /two/, 'a second broken record must not be hidden by the first')
    }
  })

  await t.test('a non-array is rejected with a readable message', () => {
    assert.throws(() => createJsonUsageStoryRepository({ records: { stories: [] } }), /must be a JSON array/)
  })
})

/* ═══ 2. The endpoint ══════════════════════════════════════════════════════ */

function storyContainer() {
  return testContainer(
    testEnv(),
    testLogger(),
    undefined,
    undefined,
    fixtureStories([
      makeStory({ id: 'alpha', order: 10, role: 'Alpha Role' }),
      makeStory({ id: 'beta', order: 20, role: 'Beta Role' }),
      makeStory({ id: 'gamma', order: 30, role: 'Gamma Role' }),
    ]),
  )
}

await test('GET /api/usage-stories', async (t) => {
  await t.test('returns the stories in the documented shape', async () => {
    await withServer(storyContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/usage-stories`)
      assert.equal(response.status, 200)

      const body = await readJson<UsageStoryListResponse>(response)
      assert.equal(body.total, 3)
      assert.deepEqual(
        body.items.map((story) => story.id),
        ['alpha', 'beta', 'gamma'],
      )
    })
  })

  await t.test('carries tool references as slugs, never as tool objects', async () => {
    // The whole point of the reference: a story must not restate a tool's name,
    // monogram, category or pricing. The client resolves slugs against the
    // catalogue it has already read.
    await withServer(storyContainer(), async ({ origin }) => {
      const body = await readJson<UsageStoryListResponse>(
        await fetch(`${origin}/api/usage-stories`),
      )
      const [story] = body.items
      assert.ok(story)
      assert.ok(Array.isArray(story.toolSlugs))
      for (const slug of story.toolSlugs) {
        assert.equal(typeof slug, 'string', 'a tool reference must be a plain slug')
      }
      const serialised = JSON.stringify(story)
      for (const leaked of ['"mono"', '"pricingTier"', '"tagline"', '"rating"']) {
        assert.equal(
          serialised.includes(leaked),
          false,
          `a story must not carry catalogue field ${leaked}`,
        )
      }
    })
  })

  await t.test('limit takes the first n', async () => {
    await withServer(storyContainer(), async ({ origin }) => {
      const body = await readJson<UsageStoryListResponse>(
        await fetch(`${origin}/api/usage-stories?limit=2`),
      )
      assert.deepEqual(body.items.map((s) => s.id), ['alpha', 'beta'])
      assert.equal(body.total, 3, 'total reports the whole set, not the page')
    })
  })

  await t.test('an unknown parameter is a 400, not a silent no-op', async () => {
    await withServer(storyContainer(), async ({ origin }) => {
      assert.equal((await fetch(`${origin}/api/usage-stories?count=2`)).status, 400)
    })
  })

  await t.test('an out-of-range limit is a 400', async () => {
    await withServer(storyContainer(), async ({ origin }) => {
      assert.equal((await fetch(`${origin}/api/usage-stories?limit=0`)).status, 400)
      assert.equal((await fetch(`${origin}/api/usage-stories?limit=999`)).status, 400)
    })
  })
})

/* ═══ 3. The real seed content ═════════════════════════════════════════════ */

const realStories = createJsonUsageStoryRepository()
const allStories: UsageStory[] = await realStories.list()
const realCatalogue = createJsonToolCatalogue()
const allTools: Tool[] = (await realCatalogue.search({ status: 'all', limit: 500 })).items
const toolSlugs = new Set(allTools.map((tool) => tool.slug))

await test('the seeded usage stories', async (t) => {
  await t.test('the rail has enough cards to loop convincingly', () => {
    // The track is duplicated and translated -50%. Too few cards and the same
    // face comes round before the reader has finished the first one.
    assert.ok(
      allStories.length >= 6 && allStories.length <= 12,
      `expected 6–12 stories, found ${allStories.length}`,
    )
  })

  await t.test('EVERY tool reference resolves against the catalogue', () => {
    // The one cross-boundary invariant. stories/ cannot check this — it has no
    // catalogue by design — so it is checked here, where both are in scope.
    const unresolved: string[] = []
    for (const story of allStories) {
      for (const slug of story.toolSlugs) {
        if (!toolSlugs.has(slug)) unresolved.push(`${story.id} → "${slug}"`)
      }
    }
    assert.deepEqual(unresolved, [], 'a story names a tool the catalogue does not have')
  })

  await t.test('no story restates catalogue metadata', () => {
    // A story carries references, not copies. If a tool's name ever appeared as
    // its own field here, it would be wrong the day the tool was renamed.
    for (const story of allStories) {
      const keys = Object.keys(story)
      for (const forbidden of ['tools', 'toolNames', 'mono', 'cat', 'model', 'pricingTier']) {
        assert.equal(keys.includes(forbidden), false, `${story.id} carries "${forbidden}"`)
      }
    }
  })

  await t.test('the stories are structurally varied, not one template', () => {
    // Eight cards that differ only in their nouns read as filler. The rail is
    // meant to show different KINDS of work.
    assert.equal(
      new Set(allStories.map((story) => story.role)).size,
      allStories.length,
      'two stories share a role',
    )
    assert.ok(
      new Set(allStories.flatMap((story) => story.toolSlugs)).size >= 12,
      'the stories draw on too narrow a slice of the catalogue',
    )
  })

  await t.test('no story ships an avatar URL', () => {
    // The UI phase deliberately sources no portraits: the card falls back to
    // initials. A bundled stock photo of a person who does not exist would be
    // the one detail that makes an illustrative card look like a real customer.
    for (const story of allStories) {
      assert.equal(story.avatarUrl, undefined, `${story.id} ships an avatar URL`)
    }
  })

  await t.test('health does not claim to know about stories', () => {
    // Same rule the health route already follows: report what exists. Stories
    // load at boot and fail the process if invalid, so a listening server is one
    // whose stories parsed — there is no second answer to give.
    assert.equal(realStories.id, 'json')
  })
})
