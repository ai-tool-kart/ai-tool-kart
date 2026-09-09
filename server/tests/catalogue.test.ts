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
  INTAKE,
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

  /*
   * This block used to assert that every rating was 0.
   *
   * That was the right guardrail while the catalogue had no ratings at all: a
   * number between 1 and 5 would have been fabricated precision. V1 now seeds
   * ratings and review counts deliberately, as INTERNAL CATALOGUE METADATA —
   * editorial standing, derived from each record's own `pop` band, not a
   * measurement of an external review platform. The guardrail therefore moves
   * rather than disappears: it now pins the shape that seeding must keep, so a
   * later real review pipeline can drop in and a careless edit still fails.
   *
   * Read the accompanying note in src/catalogue/schema.ts before changing this.
   */
  await t.test('seeded ratings stay inside the believable band', () => {
    for (const tool of allTools) {
      if (tool.rating === 0) continue
      assert.ok(
        tool.rating >= 3 && tool.rating <= 5,
        `${tool.id}: rating ${tool.rating} is outside the seeded 3–5 band`,
      )
      // One decimal place. 4.37 would claim a precision nothing measured.
      assert.equal(
        Math.round(tool.rating * 10) / 10,
        tool.rating,
        `${tool.id}: rating ${tool.rating} carries invented precision`,
      )
    }
  })

  /* ── Intake dates ─────────────────────────────────────────────────────── */

  await t.test('every seeded record carries an intake date', () => {
    // `addedAt` is optional on the SCHEMA — the catalogue must be able to hold a
    // record whose intake date is unknown — but the seed set has no excuse: it
    // was authored in one pass, so every record's date was authored with it.
    // "Recently Added Tools" is only meaningful if the whole catalogue is dated.
    for (const tool of allTools) {
      assert.ok(tool.addedAt, `${tool.id} has no addedAt`)
      assert.match(tool.addedAt as string, /^\d{4}-\d{2}-\d{2}$/, `${tool.id}: ${tool.addedAt}`)
    }
  })

  await t.test('intake dates are distinct, so recency ordering is unambiguous', () => {
    // A tie would make "the newest eight" depend on the id tiebreak rather than
    // on recency, which is exactly the accident the field exists to prevent.
    const dates = allTools.map((tool) => tool.addedAt as string)
    assert.equal(new Set(dates).size, dates.length, 'two records share an intake date')
  })

  await t.test('intake dates follow the declared INTAKE sequence', () => {
    // The seed generates dates as `anchor - rank * stepDays` (see INTAKE in
    // taxonomy.ts). Pinning the anchor and the spacing is what makes the
    // sequence reproducible rather than a set of numbers somebody typed.
    const sorted = [...allTools].sort((a, b) =>
      (b.addedAt as string).localeCompare(a.addedAt as string),
    )
    assert.equal(sorted[0]?.addedAt, INTAKE.anchor, 'the newest record is not on the anchor date')

    const DAY_MS = 24 * 60 * 60 * 1000
    sorted.forEach((tool, rank) => {
      const expected = new Date(Date.parse(`${INTAKE.anchor}T00:00:00Z`) - rank * INTAKE.stepDays * DAY_MS)
      assert.equal(
        tool.addedAt,
        expected.toISOString().slice(0, 10),
        `${tool.id} is out of step at rank ${rank}`,
      )
    })
  })

  await t.test('no record claims to have been added in the future', () => {
    // A future intake date would sit permanently at the top of the rail and
    // permanently inside any "added in the last N days" window.
    const today = new Date().toISOString().slice(0, 10)
    for (const tool of allTools) {
      assert.ok(
        (tool.addedAt as string) <= today,
        `${tool.id} claims an intake date in the future (${tool.addedAt})`,
      )
    }
  })

  await t.test('the newest records are spread across categories', () => {
    // The homepage rail shows the newest eight. If the seed's ordering ever
    // collapsed onto the file's category grouping, that rail would become "eight
    // Agents tools" — the exact failure mode that ruled out using array order.
    const newest = [...allTools]
      .sort((a, b) => (b.addedAt as string).localeCompare(a.addedAt as string))
      .slice(0, 8)
    assert.ok(
      new Set(newest.map((tool) => tool.cat)).size >= 4,
      'the newest eight tools come from too few categories',
    )
  })

  await t.test('sort: newest returns the catalogue in intake order', async () => {
    const page = await real.search({ sort: 'newest', limit: 100 })
    const dates = page.items.map((tool) => tool.addedAt as string)
    assert.deepEqual(dates, [...dates].sort().reverse())
  })

  await t.test('an unrated record carries no reviews either', () => {
    // The two fields are one statement: "nothing collected yet". A tool with 0
    // rating and 900 reviews would be incoherent, and would sort above rated
    // tools under `sort=reviews`.
    for (const tool of allTools) {
      if (tool.rating === 0) {
        assert.equal(tool.reviews, 0, `${tool.id} is unrated but claims reviews`)
      } else {
        assert.ok(tool.reviews > 0, `${tool.id} is rated but claims no reviews`)
      }
    }
  })

  await t.test('ratings vary enough for the rating filter to mean something', () => {
    // A catalogue where every tool scores 4.6 makes the Browse minimum-rating
    // control a no-op. These floors must keep producing different result sets.
    const atLeast = (floor: number) =>
      allTools.filter((tool) => tool.rating > 0 && tool.rating >= floor).length

    assert.ok(atLeast(3) > atLeast(4), 'a 4.0 floor must exclude more than a 3.0 floor')
    assert.ok(atLeast(4) > atLeast(4.5), 'a 4.5 floor must exclude more than a 4.0 floor')
    assert.ok(atLeast(4.5) > 0, 'a 4.5 floor must still return something')
    assert.ok(
      new Set(allTools.map((tool) => tool.rating)).size >= 8,
      'too few distinct ratings for the filter to discriminate',
    )
  })

  await t.test('some tools are honestly left unrated', () => {
    // A seed catalogue that claims to have assessed all 66 tools it lists is
    // claiming more than it has done — and the card's "no rating" path needs to
    // stay exercised by real data rather than only by a unit test.
    const unrated = allTools.filter((tool) => tool.rating === 0)
    assert.ok(unrated.length > 0, 'every tool is rated; nothing exercises the unrated path')
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
