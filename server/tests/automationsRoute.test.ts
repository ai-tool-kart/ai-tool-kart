/*
 * GET /api/automations and GET /api/automations/:niche/:slug — the wiring.
 *
 * Fixture automations through the container's test seam, so these assertions
 * do not move when the client sends a new batch. What the matcher ranks is
 * automationMatch.test.ts' subject; this file proves the route validates,
 * filters, caps, projects and 404s as the contract says.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { ErrorBody } from '../src/http/errorHandler.ts'
import type {
  AutomationListResponse,
  AutomationResponse,
} from '../src/http/routes/automations.ts'
import { AUTOMATIONS_API } from '../src/config/limits.ts'
import { NICHES } from '../src/domain/types.ts'
import {
  fixtureAutomations,
  makeAutomation,
  readJson,
  testContainer,
  testEnv,
  testLogger,
  withServer,
} from './helpers.ts'

/** Never rendered (SPEC-automations.md §6), so it must never be on the wire. */
const PRICE_NOTE = 'SECRET-PRICE-NOTE $19/mo verify before publishing'

const FIXTURES = [
  makeAutomation({
    id: 's-plan',
    slug: 'plan-my-week',
    niche: 'Students',
    title: 'Plan my week around exams',
    persona: 'Students juggling classes',
    tools: [{ name: 'Motion', url: 'https://usemotion.com' }, { name: 'Notion AI' }],
    pricingNote: PRICE_NOTE,
    pricingTier: 'freemium',
  }),
  makeAutomation({
    id: 's-scholar',
    slug: 'find-scholarships',
    niche: 'Students',
    title: 'Find scholarships I qualify for',
    pricingNote: PRICE_NOTE,
    pricingTier: 'paid',
    pricingTierSource: 'default',
  }),
  makeAutomation({
    id: 's-authored',
    slug: 'authored-steps',
    niche: 'Students',
    title: 'Revise with authored steps',
    pricingNote: PRICE_NOTE,
    steps: [{ title: 'Authored step', body: 'Written by an editor.' }],
  }),
  makeAutomation({ id: 's-draft', slug: 'draft-only', niche: 'Students', title: 'Unpublished draft', status: 'draft' }),
  makeAutomation({ id: 'c-plan', slug: 'plan-my-week', niche: 'Coaches', title: 'Plan my coaching week', pricingNote: PRICE_NOTE }),
  makeAutomation({ id: 'c-mcp', slug: 'mcp-recipe', niche: 'Coaches', title: 'Connect my CRM over MCP', kind: 'mcp', pricingNote: PRICE_NOTE }),
  makeAutomation({ id: 'r-amp', slug: 'screen-candidates', niche: 'Recruiters & HR', title: 'Screen candidates faster', pricingNote: PRICE_NOTE }),
  ...Array.from({ length: 12 }, (_, i) =>
    makeAutomation({ id: `re-${i}`, slug: `listing-${i}`, niche: 'Real Estate', title: `Write listing number ${i}`, pricingNote: PRICE_NOTE }),
  ),
]

const container = () =>
  testContainer(testEnv(), testLogger(), undefined, undefined, undefined, undefined, undefined, fixtureAutomations(FIXTURES))

const get = (origin: string, path: string) => fetch(`${origin}/api/automations${path}`)

await test('GET /api/automations', async (t) => {
  await t.test('200 with trimmed cards, default-capped', async () => {
    await withServer(container(), async ({ origin }) => {
      const response = await get(origin, '')
      assert.equal(response.status, 200)
      const body = await readJson<AutomationListResponse>(response)
      assert.equal(body.items.length, AUTOMATIONS_API.defaultLimit)
      assert.deepEqual(Object.keys(body.items[0] ?? {}).sort(), [
        'beginnerFriendly',
        'niche',
        'persona',
        'pricingTier',
        'slug',
        'title',
        'tools',
      ])
      assert.deepEqual(body.items[0]?.tools, ['Motion', 'Notion AI'], 'tool names only')
    })
  })

  await t.test('drafts are never listed', async () => {
    await withServer(container(), async ({ origin }) => {
      const body = await readJson<AutomationListResponse>(await get(origin, '?niche=Students&limit=50'))
      assert.deepEqual(body.items.map((i) => i.slug), ['plan-my-week', 'find-scholarships', 'authored-steps'])
    })
  })

  await t.test('niche and kind filter', async () => {
    await withServer(container(), async ({ origin }) => {
      const coaches = await readJson<AutomationListResponse>(await get(origin, '?niche=Coaches'))
      assert.deepEqual(coaches.items.map((i) => i.slug), ['plan-my-week', 'mcp-recipe'])
      const mcp = await readJson<AutomationListResponse>(await get(origin, '?kind=mcp'))
      assert.deepEqual(mcp.items.map((i) => i.slug), ['mcp-recipe'])
      const encoded = await readJson<AutomationListResponse>(await get(origin, '?niche=Recruiters%20%26%20HR'))
      assert.deepEqual(encoded.items.map((i) => i.slug), ['screen-candidates'])
    })
  })

  await t.test('q ranks through the matcher, and filters still apply', async () => {
    await withServer(container(), async ({ origin }) => {
      const ranked = await readJson<AutomationListResponse>(await get(origin, '?q=plan+my+week'))
      assert.equal(ranked.items[0]?.title, 'Plan my week around exams')
      assert.ok(ranked.items.some((i) => i.niche === 'Coaches'))

      const narrowed = await readJson<AutomationListResponse>(await get(origin, '?q=plan+my+week&niche=Coaches'))
      assert.deepEqual(narrowed.items.map((i) => i.niche), ['Coaches'])
    })
  })

  await t.test('limit caps both paths; beyond the maximum is a 400', async () => {
    await withServer(container(), async ({ origin }) => {
      assert.equal((await readJson<AutomationListResponse>(await get(origin, '?limit=2'))).items.length, 2)
      assert.equal((await readJson<AutomationListResponse>(await get(origin, '?q=listing&limit=3'))).items.length, 3)
      for (const limit of [0, -1, AUTOMATIONS_API.maxLimit + 1, 'many']) {
        assert.equal((await get(origin, `?limit=${limit}`)).status, 400, `limit=${limit}`)
      }
    })
  })

  await t.test('a bad niche is a 400 naming the field, not an empty list', async () => {
    await withServer(container(), async ({ origin }) => {
      const response = await get(origin, '?niche=NotANiche')
      assert.equal(response.status, 400)
      const body = await readJson<ErrorBody>(response)
      assert.equal(body.error.code, 'INVALID_REQUEST')
      assert.equal(body.error.message, 'Invalid query parameters — niche: is not a known niche')
      const fields = (body.error.details as { fields: Array<{ path: string; allowed?: string[] }> }).fields
      assert.equal(fields[0]?.path, 'niche')
      assert.deepEqual(fields[0]?.allowed, [...NICHES], 'the full list stays in details')
    })
  })

  await t.test('a defaulted pricing tier is omitted; a matched one is shown', async () => {
    await withServer(container(), async ({ origin }) => {
      const { items } = await readJson<AutomationListResponse>(await get(origin, '?niche=Students'))
      const scholar = items.find((i) => i.slug === 'find-scholarships')
      const plan = items.find((i) => i.slug === 'plan-my-week')
      assert.equal(scholar && 'pricingTier' in scholar, false)
      assert.equal(plan?.pricingTier, 'freemium')

      const detail = await readJson<AutomationResponse>(await get(origin, '/Students/find-scholarships'))
      assert.equal('pricingTier' in detail.automation, false)
      assert.equal('pricingTierSource' in detail.automation, false, 'the source is internal')
    })
  })

  await t.test('a bad kind is a 400 — there is no "all"', async () => {
    await withServer(container(), async ({ origin }) => {
      for (const kind of ['all', 'MCP', '']) {
        assert.equal((await get(origin, `?kind=${kind}`)).status, 400, `kind=${kind}`)
      }
    })
  })

  await t.test('an unknown parameter or an overlong q is a 400', async () => {
    await withServer(container(), async ({ origin }) => {
      assert.equal((await get(origin, '?category=Students')).status, 400)
      assert.equal((await get(origin, `?q=${'x'.repeat(AUTOMATIONS_API.maxQueryLength + 1)}`)).status, 400)
    })
  })

  await t.test('a stopword-only q is an empty list, not an error', async () => {
    await withServer(container(), async ({ origin }) => {
      const response = await get(origin, '?q=I+want+to')
      assert.equal(response.status, 200)
      assert.deepEqual((await readJson<AutomationListResponse>(response)).items, [])
    })
  })
})

await test('GET /api/automations/:niche/:slug', async (t) => {
  await t.test('200 with the full record and three derived steps', async () => {
    await withServer(container(), async ({ origin }) => {
      const response = await get(origin, '/Students/plan-my-week')
      assert.equal(response.status, 200)
      const { automation } = await readJson<AutomationResponse>(response)
      assert.equal(automation.id, 's-plan')
      assert.equal(automation.samplePrompt.length > 0, true, 'the detail view carries the full record')
      assert.deepEqual(automation.steps.map((s) => s.title), ['Open the tool', 'Use this prompt', 'How it works'])
      assert.equal('body' in (automation.steps[1] ?? {}), false, 'step 2 has no body')
      assert.equal(automation.steps[0]?.toolName, 'Motion')
      assert.equal('status' in automation, false)
    })
  })

  await t.test('authored steps win over derived ones', async () => {
    await withServer(container(), async ({ origin }) => {
      const { automation } = await readJson<AutomationResponse>(await get(origin, '/Students/authored-steps'))
      assert.deepEqual(automation.steps, [{ title: 'Authored step', body: 'Written by an editor.' }])
    })
  })

  await t.test('the same slug in two niches resolves to two records', async () => {
    await withServer(container(), async ({ origin }) => {
      const students = await readJson<AutomationResponse>(await get(origin, '/Students/plan-my-week'))
      const coaches = await readJson<AutomationResponse>(await get(origin, '/Coaches/plan-my-week'))
      assert.equal(students.automation.id, 's-plan')
      assert.equal(coaches.automation.id, 'c-plan')
    })
  })

  await t.test('a niche with spaces and "&" works URL-encoded', async () => {
    await withServer(container(), async ({ origin }) => {
      const response = await get(origin, '/Recruiters%20%26%20HR/screen-candidates')
      assert.equal(response.status, 200)
    })
  })

  await t.test('an unknown slug is a 404 through the ApiError path', async () => {
    await withServer(container(), async ({ origin }) => {
      const response = await get(origin, '/Students/not-a-real-slug')
      assert.equal(response.status, 404)
      assert.equal((await readJson<ErrorBody>(response)).error.code, 'NOT_FOUND')
    })
  })

  await t.test('a slug from another niche is a 404, not a cross-niche hit', async () => {
    await withServer(container(), async ({ origin }) => {
      assert.equal((await get(origin, '/Coaches/find-scholarships')).status, 404)
    })
  })

  await t.test('a draft is a 404', async () => {
    await withServer(container(), async ({ origin }) => {
      assert.equal((await get(origin, '/Students/draft-only')).status, 404)
    })
  })

  await t.test('a bad niche or a malformed slug is a 400', async () => {
    await withServer(container(), async ({ origin }) => {
      assert.equal((await get(origin, '/NotANiche/plan-my-week')).status, 400)
      assert.equal((await get(origin, '/Students/Not_A_Slug')).status, 400)
    })
  })
})

await test('pricingNote never leaves the server (SPEC-automations.md §6)', async (t) => {
  await t.test('not on any list, search or detail response', async () => {
    await withServer(container(), async ({ origin }) => {
      const paths = [
        '',
        '?limit=50',
        '?q=plan+my+week',
        '?niche=Coaches',
        '/Students/plan-my-week',
        '/Students/authored-steps',
        '/Coaches/mcp-recipe',
      ]
      for (const path of paths) {
        const text = await (await get(origin, path)).text()
        assert.equal(text.includes('pricingNote'), false, `${path} carries the key`)
        assert.equal(text.includes('SECRET-PRICE-NOTE'), false, `${path} carries the value`)
      }
    })
  })

  await t.test('not on any real detail response either', async () => {
    // Against the imported data: every automation's detail, one niche at a
    // time via the listing, checked for the key.
    await withServer(testContainer(), async ({ origin }) => {
      const { items } = await readJson<AutomationListResponse>(await get(origin, `?niche=Students&limit=${AUTOMATIONS_API.maxLimit}`))
      assert.ok(items.length > 0)
      for (const item of items) {
        const text = await (await get(origin, `/${encodeURIComponent(item.niche)}/${item.slug}`)).text()
        assert.equal(text.includes('pricingNote'), false, item.slug)
      }
    })
  })
})
