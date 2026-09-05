/*
 * The catalogue: the contract, the adapter, and the real seed data.
 *
 * Three concerns, deliberately in one file because they share the same subject:
 *
 *   1. The reusable contract suite, run against JsonToolCatalogue. When
 *      PostgresToolCatalogue lands, it gets a second call to the same function
 *      and nothing else changes (ASSISTANT_ARCHITECTURE_PLAN.md §16.1).
 *
 *   2. Adapter-specific behaviour the port does not promise — chiefly that
 *      invalid data fails LOUDLY at construction, naming the offending record.
 *
 *   3. Assertions against the REAL src/catalogue/data/tools.json. This is the
 *      only file that touches the seed data; every other test uses fixtures, so
 *      adding a tool does not break the suite.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import { parseCatalogue } from '../src/catalogue/schema.ts'
import {
  GOALS_BY_ROLE,
  PRICING_MODELS_BY_TIER,
  ROLES,
  TOOL_CATEGORIES,
  USE_CASES,
  WORKFLOW_STAGES,
} from '../src/catalogue/taxonomy.ts'
import { RETRIEVAL } from '../src/config/limits.ts'
import type { Tool } from '../src/domain/types.ts'
import { CONTRACT_FIXTURES, runCatalogueContract } from './catalogue.contract.ts'
import { makeTool } from './helpers.ts'

/* ═══ 1. The port contract ═════════════════════════════════════════════════ */

await runCatalogueContract({
  name: 'JsonToolCatalogue',
  create: () => createJsonToolCatalogue({ records: CONTRACT_FIXTURES }),
})

/* ═══ 2. Adapter behaviour ═════════════════════════════════════════════════ */

await test('JsonToolCatalogue fails loudly on invalid data', async (t) => {
  await t.test('a bad field names the record and the path', () => {
    assert.throws(
      () =>
        createJsonToolCatalogue({
          records: [{ ...makeTool({ id: 'broken-tool' }), cat: 'Telepathy' }],
        }),
      (error: Error) => {
        assert.match(error.message, /broken-tool/, 'the offending record must be named')
        assert.match(error.message, /cat/, 'the failing field path must be named')
        return true
      },
    )
  })

  await t.test('a record with no id is located by index', () => {
    assert.throws(
      () => createJsonToolCatalogue({ records: [{ name: 'Nameless', cat: 'Writing' }] }),
      /\[0\] name="Nameless"/,
    )
  })

  await t.test('every problem is reported, not just the first', () => {
    try {
      createJsonToolCatalogue({
        records: [
          { ...makeTool({ id: 'first-bad' }), rating: 99 },
          { ...makeTool({ id: 'second-bad' }), pop: -5 },
        ],
      })
      assert.fail('expected construction to throw')
    } catch (error) {
      const message = (error as Error).message
      assert.match(message, /first-bad/)
      assert.match(message, /second-bad/, 'a second broken record must not be hidden')
    }
  })

  await t.test('a bad record is never silently dropped', () => {
    // The failure mode this guards: a catalogue that loads 65 of 66 records and
    // says nothing has quietly stopped recommending a tool, forever.
    assert.throws(
      () =>
        createJsonToolCatalogue({
          records: [makeTool({ id: 'fine-tool' }), { id: 'rotten', name: 'Rotten' }],
        }),
      /rotten/,
    )
  })

  await t.test('an unknown key is rejected rather than ignored', () => {
    assert.throws(
      () => createJsonToolCatalogue({ records: [{ ...makeTool({ id: 'typo' }), stage: 'edit' }] }),
      /typo/,
    )
  })

  await t.test('duplicate ids fail the load', () => {
    assert.throws(
      () =>
        createJsonToolCatalogue({
          records: [makeTool({ id: 'twin', slug: 'twin-a' }), makeTool({ id: 'twin', slug: 'twin-b' })],
        }),
      /duplicate/,
    )
  })

  await t.test('duplicate slugs fail the load', () => {
    assert.throws(
      () =>
        createJsonToolCatalogue({
          records: [makeTool({ id: 'a', slug: 'same' }), makeTool({ id: 'b', slug: 'same' })],
        }),
      /duplicate/,
    )
  })

  await t.test('a pricingTier that contradicts the display chip fails', () => {
    assert.throws(
      () =>
        createJsonToolCatalogue({
          records: [makeTool({ id: 'mismatched', pricingTier: 'free', model: 'Subscription' })],
        }),
      /mismatched/,
    )
  })

  await t.test('a useCase outside the taxonomy fails', () => {
    assert.throws(
      () =>
        createJsonToolCatalogue({
          records: [makeTool({ id: 'invented', useCases: ['Achieve world peace'] })],
        }),
      /Achieve world peace/,
    )
  })

  await t.test('a non-array catalogue fails with a clear message', () => {
    assert.throws(() => parseCatalogue({ tools: [] }, { origin: 'test' }), /must be a JSON array/)
  })

  await t.test('a URL with embedded credentials is rejected', () => {
    assert.throws(
      () =>
        createJsonToolCatalogue({
          records: [makeTool({ id: 'leaky', url: 'https://user:pass@example.com' })],
        }),
      /leaky/,
    )
  })
})

/* ═══ 3. The real seed catalogue ═══════════════════════════════════════════ */

/**
 * The real catalogue, loaded once.
 *
 * If this construction throws, the seed data is invalid and the server would not
 * boot — which is exactly the outcome the schema is for.
 */
const real = createJsonToolCatalogue()
const allTools: Tool[] = (await real.search({ status: 'all', limit: 500 })).items

await test('the real seed catalogue', async (t) => {
  await t.test('loads and validates every record', () => {
    assert.ok(allTools.length > 0, 'the catalogue must not be empty')
  })

  await t.test('holds the 40–80 real records the plan calls for', () => {
    assert.ok(
      allTools.length >= 40 && allTools.length <= 80,
      `expected 40–80 records, found ${allTools.length}`,
    )
  })

  await t.test('ids are unique', () => {
    const ids = allTools.map((tool) => tool.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  await t.test('slugs are unique', () => {
    const slugs = allTools.map((tool) => tool.slug)
    assert.equal(new Set(slugs).size, slugs.length)
  })

  await t.test('every taxonomy value used is a legal one', () => {
    for (const tool of allTools) {
      assert.ok(TOOL_CATEGORIES.includes(tool.cat), `${tool.id}: category ${tool.cat}`)
      assert.ok(
        PRICING_MODELS_BY_TIER[tool.pricingTier].includes(tool.model),
        `${tool.id}: ${tool.model} is illegal for tier ${tool.pricingTier}`,
      )
      for (const role of tool.roles) {
        assert.ok(ROLES.includes(role), `${tool.id}: role ${role}`)
      }
      for (const stage of tool.stages) {
        assert.ok(WORKFLOW_STAGES.includes(stage), `${tool.id}: stage ${stage}`)
      }
      for (const useCase of tool.useCases) {
        assert.ok(USE_CASES.includes(useCase), `${tool.id}: useCase ${useCase}`)
      }
    }
  })

  await t.test('every url is a plain https address', () => {
    for (const tool of allTools) {
      assert.match(tool.url, /^https:\/\//, `${tool.id}: ${tool.url}`)
    }
  })

  await t.test('ratings are the honest "unrated" sentinel, not invented numbers', () => {
    // The seed catalogue has no review system behind it. 0 means "no ratings
    // collected yet"; anything between 1 and 5 would be fabricated precision.
    for (const tool of allTools) {
      assert.equal(tool.rating, 0, `${tool.id} carries an invented rating`)
      assert.equal(tool.reviews, 0, `${tool.id} carries an invented review count`)
    }
  })

  await t.test('every record carries the recommendation metadata retrieval needs', () => {
    for (const tool of allTools) {
      assert.ok(tool.summary.length >= 40, `${tool.id}: summary too thin to reason over`)
      assert.ok(tool.roles.length > 0, `${tool.id}: no roles`)
      assert.ok(tool.useCases.length > 0, `${tool.id}: no useCases`)
      assert.ok(tool.stages.length > 0, `${tool.id}: no stages`)
      assert.ok(tool.tags.length > 0, `${tool.id}: no tags`)
    }
  })

  /* ── Coverage: the requirement that makes plans buildable ─────────────── */

  await t.test('every workflow stage has enough active tools to staff a step', () => {
    // The guarantee in §9: below minPerStage the assistant cannot offer a real
    // choice at that step, and will be tempted to invent a tool.
    const active = allTools.filter((tool) => tool.status === 'active')
    for (const stage of WORKFLOW_STAGES) {
      const count = active.filter((tool) => tool.stages.includes(stage)).length
      assert.ok(
        count >= RETRIEVAL.minPerStage,
        `stage "${stage}" has ${count} active tools, needs ${RETRIEVAL.minPerStage}`,
      )
    }
  })

  await t.test('every role has at least three tools, so a plan is possible', () => {
    const active = allTools.filter((tool) => tool.status === 'active')
    for (const role of ROLES) {
      const count = active.filter((tool) => tool.roles.includes(role)).length
      assert.ok(count >= 3, `role "${role}" has only ${count} active tools`)
    }
  })

  await t.test('every goal in the design taxonomy is served by a tool', () => {
    const active = allTools.filter((tool) => tool.status === 'active')
    const uncovered = USE_CASES.filter(
      (useCase) => !active.some((tool) => tool.useCases.includes(useCase)),
    )
    assert.deepEqual(uncovered, [], 'a goal the setup builder offers must lead somewhere')
  })

  await t.test('every role-and-goal pair the setup builder can produce is answerable', () => {
    const active = allTools.filter((tool) => tool.status === 'active')
    const gaps: string[] = []
    for (const role of ROLES) {
      for (const goal of GOALS_BY_ROLE[role]) {
        const count = active.filter(
          (tool) => tool.roles.includes(role) && tool.useCases.includes(goal),
        ).length
        if (count === 0) gaps.push(`${role} → ${goal}`)
      }
    }
    assert.deepEqual(gaps, [])
  })

  await t.test('every category has at least one tool', () => {
    for (const category of TOOL_CATEGORIES) {
      const count = allTools.filter((tool) => tool.cat === category).length
      assert.ok(count > 0, `category "${category}" is empty`)
    }
  })

  /* ── The fictional records must not have survived ─────────────────────── */

  await t.test('none of the twelve fictional V1 mock tools appear', () => {
    // client/src/data/tools.ts holds invented records (Nova Write, Vectra
    // Vision, Cadence…). They are mock display data and must never become
    // authoritative server content.
    const fictional = [
      'Nova Write',
      'Vectra Vision',
      'Cadence',
      'Helix',
      'Lumen',
      'Atlas',
      'Prism',
      'Beacon',
      'Quanta',
      'Verve',
      'Orbit',
      'Nimbus',
    ]
    const names = new Set(allTools.map((tool) => tool.name))
    for (const name of fictional) {
      assert.equal(names.has(name), false, `fictional record "${name}" is in the catalogue`)
    }
  })

  await t.test('a handful of the real tools the design names are present', () => {
    const slugs = new Set(allTools.map((tool) => tool.slug))
    for (const slug of [
      'claude',
      'chatgpt',
      'perplexity',
      'cursor',
      'github-copilot',
      'descript',
      'opus-clip',
      'runway',
      'elevenlabs',
      'midjourney',
      'ideogram',
      'canva',
      'photoroom',
      'zapier',
      'elicit',
      'notebooklm',
      'notion-ai',
      'gamma',
      'fathom',
      'glean',
      'suno',
      'capcut',
      'kling',
      'grammarly',
      'writesonic',
      'copy-ai',
      'buffer',
      'postman',
      'gemini',
    ]) {
      assert.ok(slugs.has(slug), `expected the catalogue to contain "${slug}"`)
    }
  })

  await t.test('health reports the active count and the driver', async () => {
    const active = allTools.filter((tool) => tool.status === 'active').length
    assert.equal(await real.size(), active)
    assert.equal(real.id, 'json')
  })
})
