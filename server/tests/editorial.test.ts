/*
 * The editorial layer — overlays merged onto imported records.
 *
 * Three concerns: what applyEditorial merges and refuses (fixtures), what the
 * detail route sends for an authored guide and a plain one, and that the
 * committed overlays and the demo guide load against the real import.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEditorial, type RawOverlay } from '../src/automations/editorial.ts'
import { createJsonAutomations } from '../src/automations/json.ts'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import type { AutomationPathsResponse, AutomationResponse } from '../src/http/routes/automations.ts'
import { makeAutomation, readJson, testContainer, testEnv, testLogger, withServer } from './helpers.ts'

const RECORDS = [
  makeAutomation({ id: 'plain', slug: 'plain-guide', niche: 'Students' }),
  makeAutomation({ id: 'rich', slug: 'rich-guide', niche: 'Students' }),
  makeAutomation({ id: 'other', slug: 'other-guide', niche: 'Coaches' }),
  makeAutomation({ id: 'hidden', slug: 'hidden-guide', niche: 'Coaches', status: 'draft' }),
]

const RICH: RawOverlay = {
  file: 'rich.json',
  data: {
    automationId: 'rich',
    headline: 'How to do the rich thing',
    metaDescription: 'A written description.',
    lede: 'A short introduction.',
    updatedAt: '2026-09-28',
    intro: ['Why this guide exists.'],
    expectedResult: { summary: 'A finished thing.', checklist: ['It works'] },
    closing: { title: 'Start now', body: 'Begin with step 1.' },
    learningOutcomes: ['A finished thing'],
    beforeYouStart: [{ title: 'An account', description: 'Free is enough.' }],
    steps: [
      {
        title: 'Prepare',
        body: 'Get the inputs ready.',
        instructions: ['Collect the files', 'Rename them'],
        tools: [{ name: 'Editor', why: 'It batch-renames.' }],
        expectedOutcome: 'A tidy folder.',
        tips: ['Keep originals.'],
        resources: [{ title: 'Checklist', url: 'https://example.com/c', kind: 'checklist' }],
        cta: { label: 'Open the editor', url: 'https://example.com/editor' },
        alternatives: [{ name: 'Other Editor' }],
        explanation: ['Why this step matters.'],
      },
    ],
    tips: ['Guide-level tip.'],
    commonIssues: [{ problem: 'It fails', solution: 'Try again.' }],
    resources: [{ title: 'Template', url: 'https://example.com/t' }],
    relatedGuides: [
      { niche: 'Coaches', slug: 'other-guide' },
      { niche: 'Coaches', slug: 'hidden-guide' },
    ],
  },
}

const merge = (overlays: RawOverlay[]) => applyEditorial(RECORDS, overlays, { origin: 'test' })
const overlay = (data: Record<string, unknown>): RawOverlay => ({ file: 'x.json', data })

await test('applyEditorial', async (t) => {
  await t.test('merges an overlay onto its record and leaves the rest untouched', () => {
    const merged = merge([RICH])
    const rich = merged.find((a) => a.id === 'rich')
    assert.deepEqual(rich?.intro, ['Why this guide exists.'])
    assert.equal(rich?.steps?.[0]?.tools?.[0]?.why, 'It batch-renames.')
    assert.equal('automationId' in (rich ?? {}), false, 'the key is not copied onto the record')
    assert.deepEqual(
      merged.find((a) => a.id === 'plain'),
      RECORDS[0],
    )
  })

  await t.test('no overlays is the identity', () => {
    assert.equal(merge([]), RECORDS)
  })

  const rejects = (name: string, data: Record<string, unknown>, pattern: RegExp) =>
    t.test(name, () => assert.throws(() => merge([overlay(data)]), pattern))

  await rejects('an overlay for a record that does not exist', { automationId: 'nope', tips: ['x'] }, /no automation has id "nope"/)
  await rejects('an unknown field', { automationId: 'rich', tip: 'singular' }, /Unrecognized key/)
  await rejects('an empty list — absent has one spelling', { automationId: 'rich', tips: [] }, /tips/)
  await rejects(
    'a related guide that does not resolve',
    { automationId: 'rich', relatedGuides: [{ niche: 'Students', slug: 'missing' }] },
    /no guide at Students\/missing/,
  )
  await rejects(
    'the same related guide twice',
    { automationId: 'rich', relatedGuides: [{ niche: 'Coaches', slug: 'other-guide' }, { niche: 'Coaches', slug: 'other-guide' }] },
    /listed twice/,
  )
  await rejects(
    'a guide related to itself',
    { automationId: 'rich', relatedGuides: [{ niche: 'Students', slug: 'rich-guide' }] },
    /related to itself/,
  )
  await rejects('a date that is not YYYY-MM-DD', { automationId: 'rich', updatedAt: '28/09/2026' }, /updatedAt/)
  await rejects('a date that does not exist', { automationId: 'rich', updatedAt: '2026-02-30' }, /not a real calendar date/)
  await rejects(
    'an authored step without a description',
    { automationId: 'rich', steps: [{ title: 'No body' }] },
    /steps\.0\.body/,
  )

  await t.test('two overlays for one record', () => {
    assert.throws(() => merge([RICH, { ...RICH, file: 'again.json' }]), /already has an overlay \(rich\.json\)/)
  })

  await t.test('authored steps in both the record and the overlay', () => {
    const records = [makeAutomation({ id: 'rich', steps: [{ title: 'A', body: 'B' }] })]
    assert.throws(
      () => applyEditorial(records, [overlay({ automationId: 'rich', steps: [{ title: 'C', body: 'D' }] })], { origin: 't' }),
      /keep them in one place/,
    )
  })
})

await test('GET /api/automations/:niche/:slug with the editorial layer', async (t) => {
  const repo = createJsonAutomations({ records: RECORDS, overlays: [RICH] })
  const container = testContainer(testEnv(), testLogger(), undefined, undefined, undefined, undefined, undefined, repo)

  await withServer(container, async ({ origin }) => {
    const get = async (path: string) =>
      (await readJson<AutomationResponse>(await fetch(`${origin}/api/automations${path}`))).automation

    await t.test('an authored guide sends its editorial fields and authored steps', async () => {
      const rich = await get('/Students/rich-guide')
      assert.equal(rich.stepsSource, 'authored')
      assert.equal(rich.steps[0]?.title, 'Prepare')
      assert.deepEqual(rich.learningOutcomes, ['A finished thing'])
      assert.deepEqual(rich.commonIssues, [{ problem: 'It fails', solution: 'Try again.' }])
      assert.equal(rich.headline, 'How to do the rich thing')
      assert.equal(rich.updatedAt, '2026-09-28')
      assert.deepEqual(rich.expectedResult?.checklist, ['It works'])
      assert.deepEqual(rich.steps[0]?.explanation, ['Why this step matters.'])
    })

    await t.test('related guides: curated first (drafts skipped), then the same niche', async () => {
      const rich = await get('/Students/rich-guide')
      assert.deepEqual(
        rich.relatedGuides?.map((card) => `${card.niche}/${card.slug}`),
        ['Coaches/other-guide', 'Students/plain-guide'],
      )
    })

    await t.test('a plain guide is unchanged: derived steps, no editorial keys', async () => {
      const plain = await get('/Students/plain-guide')
      assert.equal(plain.stepsSource, 'derived')
      assert.equal(plain.steps.length, 3)
      for (const key of ['headline', 'metaDescription', 'lede', 'updatedAt', 'intro', 'learningOutcomes', 'beforeYouStart', 'tips', 'commonIssues', 'resources', 'expectedResult', 'closing']) {
        assert.equal(key in plain, false, `${key} must be absent`)
      }
    })

    await t.test('a plain guide still gets same-niche related guides, never itself', async () => {
      const plain = await get('/Students/plain-guide')
      assert.deepEqual(plain.relatedGuides?.map((card) => card.slug), ['rich-guide'])
    })

    await t.test('/paths lists every active guide and nothing else', async () => {
      const body = await readJson<AutomationPathsResponse>(await fetch(`${origin}/api/automations/paths`))
      assert.deepEqual(
        body.items.map((item) => `${item.niche}/${item.slug}`).sort(),
        ['Coaches/other-guide', 'Students/plain-guide', 'Students/rich-guide'],
      )
      assert.deepEqual(Object.keys(body.items[0] ?? {}).sort(), ['niche', 'slug'])
    })
  })
})

await test('the committed editorial content', async (t) => {
  await t.test('every overlay in editorial/ loads against the real import', () => {
    assert.doesNotThrow(() => createJsonAutomations())
  })

  await t.test('the demo guide loads only when asked for, and adds exactly one guide', async () => {
    const real = createJsonAutomations()
    const withDemo = createJsonAutomations({ includeDemo: true })
    assert.equal((await withDemo.size()) - (await real.size()), 1)
    const demo = (await withDemo.list()).filter((a) => a.batch.startsWith('DEMO'))
    assert.equal(demo.length, 1)
    assert.ok(demo[0]?.steps && demo[0].steps.length > 3, 'the demo carries authored steps')
    assert.equal((await real.list()).some((a) => a.batch.startsWith('DEMO')), false)
  })

  await t.test('an overlay changes its own guide and no other', async () => {
    const withOverlays = await createJsonAutomations().list()
    const withoutOverlays = new Map((await createJsonAutomations({ overlays: [] }).list()).map((a) => [a.id, a]))
    const changed = withOverlays.filter((a) => JSON.stringify(a) !== JSON.stringify(withoutOverlays.get(a.id)))
    const editorialIds = withOverlays.filter((a) => a.headline || a.intro || a.steps).map((a) => a.id)
    assert.deepEqual(changed.map((a) => a.id).sort(), editorialIds.sort())
    assert.ok(editorialIds.length >= 3, 'the production editorial guides are loaded')
  })

  /*
   * A lint over every production overlay: the content rules the README asks
   * for, held in code. It publishes to every reader and search engine, so
   * placeholder links, template leftovers and invented catalogue links are
   * failures, not style notes.
   */
  await t.test('production overlays contain no placeholder content or invented links', async () => {
    const catalogue = fixtureCatalogueFromData()
    const editorial = (await createJsonAutomations().list()).filter((a) => a.headline || a.intro || a.steps)
    const problems: string[] = []
    const today = new Date().toISOString().slice(0, 10)
    for (const guide of editorial) {
      // Every string value in the record — never its JSON syntax, where "}}"
      // is just two objects closing.
      const values = stringsOf(guide)
      if (values.some((v) => /^https?:\/\/(www\.)?example\.(com|org|net)\b/.test(v))) problems.push(`${guide.id}: example.* link`)
      const leftover = values.find((v) => /\b(TODO|TBD|lorem ipsum)\b|\bPLACEHOLDER\b|\{\{|\}\}/.test(v))
      if (leftover) problems.push(`${guide.id}: template leftover in "${leftover.slice(0, 60)}"`)
      if (guide.updatedAt && guide.updatedAt > today) problems.push(`${guide.id}: updatedAt is in the future`)
      const tools = (guide.steps ?? []).flatMap((step) => [...(step.tools ?? []), ...(step.alternatives ?? [])])
      for (const tool of tools) {
        if (tool.catalogueSlug && !(await catalogue.findBySlug(tool.catalogueSlug))) {
          problems.push(`${guide.id}: ${tool.name} → catalogue slug "${tool.catalogueSlug}" does not exist`)
        }
      }
      for (const ref of guide.relatedGuides ?? []) {
        if (ref.niche !== guide.niche) problems.push(`${guide.id}: related guide outside its niche (${ref.niche}) — check it is intended`)
      }
    }
    assert.deepEqual(problems, [])
  })
})

/** Every string anywhere inside a value, depth first. */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsOf)
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf)
  return []
}

/** The real catalogue, read the way the server reads it. */
function fixtureCatalogueFromData() {
  return createJsonToolCatalogue()
}
