/*
 * The homepage selection — automations/home.ts (pure) and GET /api/automations/home.
 *
 * The ranking is tested on fixtures that differ in exactly one signal, so each
 * assertion names the rule it proves. The route is tested on fixtures through
 * the container's seam, and once against the real imported catalogue for the
 * properties that must hold whatever the client sends next (no counts pinned).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJsonAutomations } from '../src/automations/json.ts'
import { compareForHome, hasEditorial, rankForHome, selectHome } from '../src/automations/home.ts'
import type { Automation } from '../src/automations/types.ts'
import { HOME_WORKFLOWS } from '../src/config/limits.ts'
import type { AutomationHomeResponse } from '../src/http/routes/automations.ts'
import {
  fixtureAutomations,
  makeAutomation,
  readJson,
  testContainer,
  testEnv,
  testLogger,
  withServer,
} from './helpers.ts'

const ids = (automations: readonly Automation[]) => automations.map((automation) => automation.id)

/** A plain record: no editorial, trust 3, no catalogue match, beginner 'yes'. */
const plain = (id: string, overrides: Partial<Automation> = {}) =>
  makeAutomation({ id, slug: id, title: `Task ${id}`, trustScore: 3, beginnerFriendly: 'yes', ...overrides })

const matched = [{ name: 'Claude', url: 'https://claude.ai', catalogueSlug: 'claude' }]

await test('rankForHome', async (t) => {
  await t.test('editorial guides rank ahead of otherwise equivalent records', () => {
    const ranked = rankForHome([plain('a'), plain('b', { lede: 'Written by an editor.' })])
    assert.deepEqual(ids(ranked), ['b', 'a'])
  })

  await t.test('authored steps count as editorial content', () => {
    assert.equal(hasEditorial(plain('s', { steps: [{ title: 'Step', body: 'Body.' }] })), true)
    assert.equal(hasEditorial(plain('p')), false)
  })

  await t.test('editorial outranks a higher trustScore', () => {
    const ranked = rankForHome([plain('trusted', { trustScore: 5 }), plain('edited', { trustScore: 2, intro: ['Why.'] })])
    assert.deepEqual(ids(ranked), ['edited', 'trusted'])
  })

  await t.test('higher trustScore ranks ahead of lower', () => {
    const ranked = rankForHome([plain('three'), plain('five', { trustScore: 5 }), plain('four', { trustScore: 4 })])
    assert.deepEqual(ids(ranked), ['five', 'four', 'three'])
  })

  await t.test('more catalogue-matched tools rank ahead when trust is equal', () => {
    const ranked = rankForHome([plain('none'), plain('one', { tools: matched })])
    assert.deepEqual(ids(ranked), ['one', 'none'])
  })

  await t.test('trustScore outranks catalogue matches', () => {
    const ranked = rankForHome([plain('matched', { tools: matched }), plain('trusted', { trustScore: 4 })])
    assert.deepEqual(ids(ranked), ['trusted', 'matched'])
  })

  await t.test('beginnerFriendly breaks the next tie: yes, somewhat, no', () => {
    const ranked = rankForHome([
      plain('no', { beginnerFriendly: 'no' }),
      plain('yes', { beginnerFriendly: 'yes' }),
      plain('somewhat', { beginnerFriendly: 'somewhat' }),
    ])
    assert.deepEqual(ids(ranked), ['yes', 'somewhat', 'no'])
  })

  await t.test('a full tie keeps import order, and the input is not mutated', () => {
    const input = [plain('first'), plain('second'), plain('third')]
    assert.deepEqual(ids(rankForHome(input)), ['first', 'second', 'third'])
    assert.equal(compareForHome(plain('x'), plain('y')), 0)
    assert.deepEqual(ids(input), ['first', 'second', 'third'])
  })

  await t.test('is deterministic whatever order equal-signal records arrive in', () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      plain(`r${i}`, { trustScore: ((i % 3) + 2) as Automation['trustScore'] }),
    )
    const once = ids(rankForHome(records))
    assert.deepEqual(ids(rankForHome(records)), once)
    assert.deepEqual(once.slice(0, 6), ['r2', 'r5', 'r8', 'r11', 'r14', 'r17'])
  })
})

await test('selectHome', async (t) => {
  const niche = (name: Automation['niche'], count: number, overrides: (i: number) => Partial<Automation> = () => ({})) =>
    Array.from({ length: count }, (_, i) => plain(`${name}-${i}`, { niche: name, ...overrides(i) }))

  await t.test('caps each niche at perNiche, ranked, with the real total', () => {
    const students = niche('Students', 9, (i) => (i === 7 ? { trustScore: 5 } : {}))
    const { niches } = selectHome({ niches: [{ niche: 'Students', automations: students }], perNiche: 3 })
    assert.equal(niches.length, 1)
    assert.equal(niches[0]?.total, 9)
    assert.deepEqual(ids(niches[0]?.items ?? []), ['Students-7', 'Students-0', 'Students-1'])
  })

  await t.test('keeps configured order and drops niches with no guides', () => {
    const { niches } = selectHome({
      niches: [
        { niche: 'Sales Teams', automations: niche('Sales Teams', 2) },
        { niche: 'Not A Real Niche', automations: [] },
        { niche: 'Coaches', automations: [] },
        { niche: 'Students', automations: niche('Students', 2) },
      ],
      perNiche: 6,
    })
    assert.deepEqual(niches.map((group) => group.niche), ['Sales Teams', 'Students'])
  })

  await t.test('skips drafts, foreign-niche records and a niche configured twice', () => {
    const students = [...niche('Students', 2), plain('draft', { niche: 'Students', status: 'draft' }), plain('stray', { niche: 'Coaches' })]
    const { niches } = selectHome({
      niches: [
        { niche: 'Students', automations: students },
        { niche: 'Students', automations: students },
      ],
      perNiche: 6,
    })
    assert.equal(niches.length, 1)
    assert.deepEqual(ids(niches[0]?.items ?? []), ['Students-0', 'Students-1'])
    assert.equal(niches[0]?.total, 2)
  })

  await t.test('"All" takes each niche\'s best, ranked by the same rules', () => {
    const { niches, all } = selectHome({
      niches: [
        { niche: 'Students', automations: niche('Students', 4) },
        { niche: 'Sales Teams', automations: niche('Sales Teams', 4, (i) => (i === 2 ? { trustScore: 5 } : {})) },
        { niche: 'Coaches', automations: niche('Coaches', 4, (i) => (i === 3 ? { lede: 'Edited.' } : {})) },
      ],
      perNiche: 3,
    })
    // One per niche (ceil(3/3)): the editorial guide, then trust 5, then the plain one.
    assert.deepEqual(ids(all.items), ['Coaches-3', 'Sales Teams-2', 'Students-0'])
    assert.equal(all.total, 12)
    // Every "All" card is the same record as its niche's card — not a copy from elsewhere.
    const fromNiches = new Set(niches.flatMap((group) => group.items))
    for (const item of all.items) assert.ok(fromNiches.has(item))
  })

  await t.test('"All" tops up from the next guides when a niche is small', () => {
    const { all } = selectHome({
      niches: [
        { niche: 'Students', automations: niche('Students', 5) },
        { niche: 'Sales Teams', automations: niche('Sales Teams', 1) },
      ],
      perNiche: 4,
    })
    assert.deepEqual(ids(all.items), ['Students-0', 'Students-1', 'Sales Teams-0', 'Students-2'])
  })

  await t.test('returns no duplicates and nothing at all for no niches', () => {
    assert.deepEqual(selectHome({ niches: [], perNiche: 6 }), { niches: [], all: { total: 0, items: [] } })
    const { niches, all } = selectHome({
      niches: [{ niche: 'Students', automations: niche('Students', 10) }],
      perNiche: 6,
    })
    const shown = ids(niches[0]?.items ?? [])
    assert.equal(new Set(shown).size, shown.length)
    assert.equal(new Set(ids(all.items)).size, all.items.length)
  })
})

/* ── The route, on fixtures ───────────────────────────────────────────────── */

const [firstNiche, secondNiche] = HOME_WORKFLOWS.niches
const FIXTURES = [
  ...Array.from({ length: HOME_WORKFLOWS.perNiche + 3 }, (_, i) =>
    plain(`a-${i}`, { niche: firstNiche, trustScore: i === 4 ? 5 : 3 }),
  ),
  plain('b-0', { niche: secondNiche, tools: matched }),
  plain('b-mcp', { niche: secondNiche, kind: 'mcp' }),
  plain('b-draft', { niche: secondNiche, status: 'draft' }),
  // Not a homepage niche: must never appear.
  plain('c-0', { niche: 'Coaches', trustScore: 5, steps: [{ title: 'Step', body: 'Edited.' }] }),
]

const container = () =>
  testContainer(testEnv(), testLogger(), undefined, undefined, undefined, undefined, undefined, fixtureAutomations(FIXTURES))

await test('GET /api/automations/home', async (t) => {
  await t.test('200 with configured niches present, capped and ranked; absent ones omitted', async () => {
    await withServer(container(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/automations/home`)
      assert.equal(response.status, 200)
      const body = await readJson<AutomationHomeResponse>(response)

      assert.deepEqual(body.niches.map((group) => group.niche), [firstNiche, secondNiche])
      const [first, second] = body.niches
      assert.equal(first?.total, HOME_WORKFLOWS.perNiche + 3)
      assert.equal(first?.items.length, HOME_WORKFLOWS.perNiche)
      assert.equal(first?.items[0]?.slug, 'a-4')
      // The MCP recipe and the draft are not homepage setups.
      assert.equal(second?.total, 1)
      assert.deepEqual(second?.items.map((card) => card.slug), ['b-0'])
      assert.deepEqual(second?.items[0]?.catalogueTools, [{ name: 'Claude', catalogueSlug: 'claude' }])
    })
  })

  await t.test('cards are the list endpoint\'s projection, and never leak the price note', async () => {
    await withServer(container(), async ({ origin }) => {
      const text = await (await fetch(`${origin}/api/automations/home`)).text()
      assert.equal(text.includes('pricingNote'), false)
      const body = JSON.parse(text) as AutomationHomeResponse
      const list = await readJson<{ items: unknown[] }>(
        await fetch(`${origin}/api/automations?niche=${encodeURIComponent(secondNiche)}`),
      )
      assert.deepEqual(body.niches[1]?.items[0], list.items[0])
    })
  })

  await t.test('"All" is drawn from the niche cards', async () => {
    await withServer(container(), async ({ origin }) => {
      const body = await readJson<AutomationHomeResponse>(await fetch(`${origin}/api/automations/home`))
      const key = (card: { niche: string; slug: string }) => `${card.niche}/${card.slug}`
      const nicheCards = new Set(body.niches.flatMap((group) => group.items.map(key)))
      assert.ok(body.all.items.length > 0)
      for (const card of body.all.items) assert.ok(nicheCards.has(key(card)), key(card))
      assert.equal(body.all.total, body.niches.reduce((sum, group) => sum + group.total, 0))
      assert.equal(body.all.items[0]?.slug, 'a-4')
    })
  })

  await t.test('a catalogue with none of the configured niches is an empty 200, not an error', async () => {
    const empty = () =>
      testContainer(
        testEnv(), testLogger(), undefined, undefined, undefined, undefined, undefined,
        fixtureAutomations([plain('only', { niche: 'Coaches' })]),
      )
    await withServer(empty(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/automations/home`)
      assert.equal(response.status, 200)
      assert.deepEqual(await readJson<AutomationHomeResponse>(response), { niches: [], all: { total: 0, items: [] } })
    })
  })

  await t.test('does not shadow the detail route', async () => {
    await withServer(container(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/automations/${encodeURIComponent(firstNiche)}/a-0`)
      assert.equal(response.status, 200)
    })
  })
})

/* ── The selection over the real catalogue ────────────────────────────────── */

await test('the homepage selection over the imported catalogue', async (t) => {
  const repository = createJsonAutomations()
  const niches = await Promise.all(
    HOME_WORKFLOWS.niches.map(async (niche) => ({ niche, automations: await repository.list({ niche, kind: 'workflow' }) })),
  )
  const selection = selectHome({ niches, perNiche: HOME_WORKFLOWS.perNiche })

  await t.test('every configured niche has guides, and each shows the configured number', () => {
    assert.deepEqual(selection.niches.map((group) => group.niche), [...HOME_WORKFLOWS.niches])
    for (const group of selection.niches) {
      assert.equal(group.items.length, Math.min(HOME_WORKFLOWS.perNiche, group.total), group.niche)
    }
    assert.equal(selection.all.items.length, HOME_WORKFLOWS.perNiche)
  })

  await t.test('every card is a real, active record of its niche, shown once', async () => {
    const shown = selection.niches.flatMap((group) => group.items)
    assert.equal(new Set(ids(shown)).size, shown.length)
    for (const item of shown) {
      const stored = await repository.findBySlug(item.niche, item.slug)
      assert.equal(stored?.id, item.id)
      assert.equal(stored?.status, 'active')
    }
  })

  await t.test('"All" holds one guide from each configured niche', () => {
    assert.deepEqual(
      new Set(selection.all.items.map((item) => item.niche)),
      new Set(HOME_WORKFLOWS.niches),
    )
  })
})
