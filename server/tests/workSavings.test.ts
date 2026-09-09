/*
 * Work-savings estimates: the adapter, the endpoint, and the real seed content.
 *
 * Three concerns in one file, as tests/catalogue.test.ts and tests/stories.test.ts
 * do for theirs. The last block is the only place that touches the real
 * workSavings.json, so writing an estimate does not break the rest of the suite.
 *
 * Two assertions here are about HONESTY rather than mechanics, and they are the
 * reason this file is longer than the endpoint deserves:
 *
 *   - every `catalogueRole` must be a role the catalogue actually defines, so
 *     the link between the two vocabularies cannot rot into a lookalike string;
 *   - every catalogue role must HAVE an estimate, so the site's own role list
 *     never contains a role this section silently cannot answer for.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { ROLES } from '../src/catalogue/taxonomy.ts'
import { SAVINGS_DIMENSIONS, type WorkSavingsEstimate } from '../src/domain/types.ts'
import { createJsonWorkSavingsRepository } from '../src/savings/json.ts'
import type { WorkSavingsListResponse } from '../src/http/routes/workSavings.ts'
import {
  fixtureSavings,
  makeSavings,
  readJson,
  testContainer,
  testEnv,
  testLogger,
  withServer,
} from './helpers.ts'

/* ═══ 1. The adapter ═══════════════════════════════════════════════════════ */

await test('JsonWorkSavingsRepository', async (t) => {
  await t.test('returns estimates in editorial order, not file order', async () => {
    const repo = fixtureSavings([
      makeSavings({ id: 'third', role: 'Third', order: 30 }),
      makeSavings({ id: 'first', role: 'First', order: 10 }),
      makeSavings({ id: 'second', role: 'Second', order: 20 }),
    ])
    assert.deepEqual(
      (await repo.list()).map((e) => e.id),
      ['first', 'second', 'third'],
    )
  })

  await t.test('limit takes from the front of that order', async () => {
    const repo = fixtureSavings([
      makeSavings({ id: 'a', role: 'A', order: 10 }),
      makeSavings({ id: 'b', role: 'B', order: 20 }),
      makeSavings({ id: 'c', role: 'C', order: 30 }),
    ])
    assert.deepEqual((await repo.list({ limit: 2 })).map((e) => e.id), ['a', 'b'])
    assert.equal(await repo.size(), 3, 'size reports the whole set, not the page')
  })

  await t.test('a caller cannot mutate the shared set', async () => {
    const repo = fixtureSavings([
      makeSavings({ id: 'a', role: 'A', order: 10 }),
      makeSavings({ id: 'b', role: 'B', order: 20 }),
    ])
    ;(await repo.list()).reverse()
    assert.deepEqual((await repo.list()).map((e) => e.id), ['a', 'b'])
  })

  await t.test('reports its driver', () => {
    assert.equal(fixtureSavings([]).id, 'json')
  })
})

await test('JsonWorkSavingsRepository fails loudly on invalid data', async (t) => {
  await t.test('a bad field names the record and the path', () => {
    assert.throws(
      () =>
        createJsonWorkSavingsRepository({
          records: [{ ...makeSavings({ id: 'broken' }), costSaved: '' }],
        }),
      (error: Error) => {
        assert.match(error.message, /broken/, 'the offending record must be named')
        assert.match(error.message, /costSaved/, 'the failing field path must be named')
        return true
      },
    )
  })

  await t.test('an unknown key is rejected, not ignored', () => {
    assert.throws(
      () => createJsonWorkSavingsRepository({ records: [{ ...makeSavings(), moneySaved: '£400' }] }),
      /moneySaved/,
    )
  })

  await t.test('rows must be Time, Cost and Effort in that order', () => {
    // The left-hand table and the role panel render the same three axes. A
    // shuffled record would silently disagree with the table beside it.
    const shuffled = makeSavings()
    assert.throws(
      () =>
        createJsonWorkSavingsRepository({
          records: [{ ...shuffled, rows: [...shuffled.rows].reverse() }],
        }),
      /rows/,
    )
  })

  await t.test('a missing row is rejected', () => {
    const short = makeSavings()
    assert.throws(
      () => createJsonWorkSavingsRepository({ records: [{ ...short, rows: short.rows.slice(0, 2) }] }),
      /rows/,
    )
  })

  await t.test('an unknown catalogueRole is rejected', () => {
    // The field exists to be the SAME vocabulary. A lookalike string would link
    // to nothing while looking like it linked.
    assert.throws(
      () =>
        createJsonWorkSavingsRepository({
          records: [{ ...makeSavings(), catalogueRole: 'Developper' }],
        }),
      /catalogueRole/,
    )
  })

  await t.test('an absurd hours figure is rejected', () => {
    // A guard against a typo turning an editorial estimate into a claim nobody
    // meant to make.
    assert.throws(
      () => createJsonWorkSavingsRepository({ records: [{ ...makeSavings(), hoursSavedPerWeek: 400 }] }),
      /hoursSavedPerWeek/,
    )
  })

  await t.test('duplicate id, order or role is rejected', () => {
    for (const dupe of [
      { id: 'same' },
      { order: 5 },
      { role: 'Same Role' },
    ] as Array<Partial<WorkSavingsEstimate>>) {
      assert.throws(
        () =>
          createJsonWorkSavingsRepository({
            records: [
              makeSavings({ id: 'a', role: 'A', order: 1, ...dupe }),
              makeSavings({ id: 'b', role: 'B', order: 2, ...dupe }),
            ],
          }),
        /duplicate/,
      )
    }
  })

  await t.test('every failure is reported, not just the first', () => {
    try {
      createJsonWorkSavingsRepository({
        records: [
          { ...makeSavings({ id: 'one', role: 'One' }), costSaved: '' },
          { ...makeSavings({ id: 'two', role: 'Two' }), effortSaved: '' },
        ],
      })
      assert.fail('expected the constructor to throw')
    } catch (error) {
      const message = (error as Error).message
      assert.match(message, /one/)
      assert.match(message, /two/, 'a second broken record must not be hidden by the first')
    }
  })
})

/* ═══ 2. The endpoint ══════════════════════════════════════════════════════ */

function savingsContainer() {
  return testContainer(
    testEnv(),
    testLogger(),
    undefined,
    undefined,
    undefined,
    fixtureSavings([
      makeSavings({ id: 'alpha', role: 'Alpha Role', order: 10 }),
      makeSavings({ id: 'beta', role: 'Beta Role', order: 20 }),
      makeSavings({ id: 'gamma', role: 'Gamma Role', order: 30 }),
    ]),
  )
}

await test('GET /api/work-savings', async (t) => {
  await t.test('returns the estimates in the documented shape', async () => {
    await withServer(savingsContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/work-savings`)
      assert.equal(response.status, 200)

      const body = await readJson<WorkSavingsListResponse>(response)
      assert.equal(body.total, 3)
      assert.deepEqual(body.items.map((e) => e.role), ['Alpha Role', 'Beta Role', 'Gamma Role'])
      const [first] = body.items
      assert.ok(first)
      assert.deepEqual(first.rows.map((r) => r.dimension), [...SAVINGS_DIMENSIONS])
    })
  })

  await t.test('limit takes the first n', async () => {
    await withServer(savingsContainer(), async ({ origin }) => {
      const body = await readJson<WorkSavingsListResponse>(
        await fetch(`${origin}/api/work-savings?limit=2`),
      )
      assert.deepEqual(body.items.map((e) => e.id), ['alpha', 'beta'])
      assert.equal(body.total, 3, 'total reports the whole set, not the page')
    })
  })

  await t.test('an unknown parameter is a 400, not a silent no-op', async () => {
    await withServer(savingsContainer(), async ({ origin }) => {
      assert.equal((await fetch(`${origin}/api/work-savings?role=Developer`)).status, 400)
    })
  })

  await t.test('an out-of-range limit is a 400', async () => {
    await withServer(savingsContainer(), async ({ origin }) => {
      assert.equal((await fetch(`${origin}/api/work-savings?limit=0`)).status, 400)
      assert.equal((await fetch(`${origin}/api/work-savings?limit=999`)).status, 400)
    })
  })
})

/* ═══ 3. The real seed content ═════════════════════════════════════════════ */

const realSavings = createJsonWorkSavingsRepository()
const allEstimates: WorkSavingsEstimate[] = await realSavings.list()

await test('the seeded work-savings estimates', async (t) => {
  await t.test('the selector has a useful range of work to choose from', () => {
    assert.ok(
      allEstimates.length >= 10 && allEstimates.length <= 30,
      `expected 10–30 estimates, found ${allEstimates.length}`,
    )
  })

  await t.test('every catalogueRole is a role the catalogue actually defines', () => {
    const known = new Set<string>(ROLES)
    const bad = allEstimates
      .filter((e) => e.catalogueRole !== undefined && !known.has(e.catalogueRole))
      .map((e) => `${e.id} → "${e.catalogueRole ?? ''}"`)
    assert.deepEqual(bad, [], 'an estimate links to a role the taxonomy does not have')
  })

  await t.test('every catalogue role has an estimate', () => {
    // The site offers one role vocabulary. A role a reader can be described by
    // elsewhere on the site, but which this section cannot answer for, is a gap
    // the reader would experience as the feature being broken for them.
    const covered = new Set(allEstimates.map((e) => e.catalogueRole).filter(Boolean))
    const missing = ROLES.filter((role) => !covered.has(role))
    assert.deepEqual(missing, [], 'a catalogue role has no work-savings estimate')
  })

  await t.test('a catalogue role is claimed by at most one estimate', () => {
    const seen = new Map<string, string>()
    for (const estimate of allEstimates) {
      if (!estimate.catalogueRole) continue
      const first = seen.get(estimate.catalogueRole)
      assert.equal(first, undefined, `${estimate.catalogueRole} claimed by ${first} and ${estimate.id}`)
      seen.set(estimate.catalogueRole, estimate.id)
    }
  })

  await t.test('every estimate carries all three dimensions in order', () => {
    for (const estimate of allEstimates) {
      assert.deepEqual(
        estimate.rows.map((row) => row.dimension),
        [...SAVINGS_DIMENSIONS],
        `${estimate.id} has the wrong rows`,
      )
    }
  })

  await t.test('the figures stay conservative', () => {
    // These are written estimates, not measurements. A record claiming most of a
    // working week back, or a round "100%" cost saving, would read as a
    // guarantee — which is precisely what this section must not imply.
    for (const estimate of allEstimates) {
      assert.ok(
        estimate.hoursSavedPerWeek >= 5 && estimate.hoursSavedPerWeek <= 15,
        `${estimate.id}: ${estimate.hoursSavedPerWeek} hrs/week is outside the seeded 5–15 band`,
      )
      assert.match(
        estimate.costSaved,
        /^\d{2}–\d{2}%$/u,
        `${estimate.id}: costSaved "${estimate.costSaved}" should be a two-figure range`,
      )
      const [low, high] = estimate.costSaved.replace('%', '').split('–').map(Number)
      assert.ok(low !== undefined && high !== undefined && low < high, `${estimate.id}: bad range`)
      assert.ok(high <= 60, `${estimate.id}: a ${high}% cost saving is not a conservative estimate`)
    }
  })

  await t.test('no estimate claims to be measured', () => {
    // The wording lives on the client (SAVINGS_COPY) precisely so it has one
    // home. This guards the DATA against acquiring its own claim vocabulary.
    // Deliberately NOT "study": "Study time better spent" is a student's
    // studying, not a research study, and a guard that fires on ordinary English
    // is a guard that gets deleted.
    const claimWords = /\b(median|measured|audited|guaranteed|proven|benchmark(ed)?)\b/i
    for (const estimate of allEstimates) {
      const text = [estimate.effortSaved, ...estimate.rows.flatMap((r) => [r.without, r.withAi])]
      for (const line of text) {
        assert.equal(
          claimWords.test(line),
          false,
          `${estimate.id}: "${line}" reads as a measurement claim`,
        )
      }
    }
  })
})
