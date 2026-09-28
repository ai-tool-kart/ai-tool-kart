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
import type { AutomationResponse } from '../src/http/routes/automations.ts'
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
    intro: ['Why this guide exists.'],
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
    'a guide related to itself',
    { automationId: 'rich', relatedGuides: [{ niche: 'Students', slug: 'rich-guide' }] },
    /related to itself/,
  )
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
    })

    await t.test('curated related guides arrive as cards, drafts skipped', async () => {
      const rich = await get('/Students/rich-guide')
      assert.deepEqual(
        rich.relatedGuides?.map((card) => `${card.niche}/${card.slug}`),
        ['Coaches/other-guide'],
      )
    })

    await t.test('a plain guide is unchanged: derived steps, no editorial keys', async () => {
      const plain = await get('/Students/plain-guide')
      assert.equal(plain.stepsSource, 'derived')
      assert.equal(plain.steps.length, 3)
      for (const key of ['intro', 'learningOutcomes', 'beforeYouStart', 'tips', 'commonIssues', 'resources', 'relatedGuides']) {
        assert.equal(key in plain, false, `${key} must be absent`)
      }
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
})
