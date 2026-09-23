/*
 * Automations: the port, the JSON adapter, and the imported content.
 *
 * Three concerns, as tests/stories.test.ts has them: what the port promises
 * (against fixtures), how the adapter fails (against temporary directories),
 * and what the committed import must satisfy. The last block is the only one
 * that reads src/automations/data/, so a re-import changes one block.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJsonAutomations } from '../src/automations/json.ts'
import { NICHES } from '../src/domain/types.ts'
import { slugify } from '../src/review/slug.ts'
import { fixtureAutomations, makeAutomation, testContainer } from './helpers.ts'

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'automations', 'data')

/* ═══ 1. The port ══════════════════════════════════════════════════════════ */

const FIXTURES = [
  makeAutomation({ id: 's-1', slug: 'plan-my-week', niche: 'Students', title: 'Plan my week' }),
  makeAutomation({ id: 's-2', slug: 'find-scholarships', niche: 'Students', title: 'Find scholarships' }),
  makeAutomation({ id: 's-3', slug: 'draft-only', niche: 'Students', status: 'draft' }),
  makeAutomation({ id: 'c-1', slug: 'plan-my-week', niche: 'Coaches', title: 'Plan my coaching week' }),
  makeAutomation({ id: 'c-2', slug: 'mcp-recipe', niche: 'Coaches', kind: 'mcp' }),
]

await test('AutomationRepository (JSON adapter over fixtures)', async (t) => {
  const repo = fixtureAutomations(FIXTURES)

  await t.test('findBySlug distinguishes the same slug in two niches', async () => {
    assert.equal((await repo.findBySlug('Students', 'plan-my-week'))?.id, 's-1')
    assert.equal((await repo.findBySlug('Coaches', 'plan-my-week'))?.id, 'c-1')
  })

  await t.test('findBySlug is undefined for an unknown niche or slug, never a throw', async () => {
    assert.equal(await repo.findBySlug('Nowhere', 'plan-my-week'), undefined)
    assert.equal(await repo.findBySlug('Students', 'no-such-slug'), undefined)
  })

  await t.test('lookup by slug reaches drafts — status filtering is a listing concern', async () => {
    assert.equal((await repo.findBySlug('Students', 'draft-only'))?.id, 's-3')
  })

  await t.test('listByNiche returns that niche, active only, in import order', async () => {
    assert.deepEqual((await repo.listByNiche('Students')).map((a) => a.id), ['s-1', 's-2'])
    assert.deepEqual(await repo.listByNiche('Nowhere'), [])
  })

  await t.test('list filters by kind and niche, excludes drafts, and caps', async () => {
    assert.deepEqual((await repo.list()).map((a) => a.id), ['s-1', 's-2', 'c-1', 'c-2'])
    assert.deepEqual((await repo.list({ kind: 'mcp' })).map((a) => a.id), ['c-2'])
    assert.deepEqual((await repo.list({ kind: 'workflow', niche: 'Coaches' })).map((a) => a.id), ['c-1'])
    assert.deepEqual((await repo.list({ limit: 2 })).map((a) => a.id), ['s-1', 's-2'])
    assert.deepEqual(await repo.list({ limit: -1 }), [])
  })

  await t.test('findManyByIds drops unknown ids and reaches drafts', async () => {
    assert.deepEqual((await repo.findManyByIds(['c-1', 'ghost', 's-3'])).map((a) => a.id), ['s-3', 'c-1'])
  })

  await t.test('size counts active records', async () => {
    assert.equal(await repo.size(), 4)
  })

  await t.test('a caller cannot mutate the shared set', async () => {
    const first = await repo.listByNiche('Students')
    first.reverse()
    const all = await repo.list()
    all.length = 0
    assert.deepEqual((await repo.listByNiche('Students')).map((a) => a.id), ['s-1', 's-2'])
    assert.equal((await repo.list()).length, 4)
  })

  await t.test('reports its driver', () => {
    assert.equal(repo.id, 'json')
  })
})

/* ═══ 2. Failing loudly ════════════════════════════════════════════════════ */

await test('the JSON adapter fails the load loudly', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'automations-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const writeDir = async (name: string, files: Record<string, string>) => {
    const target = join(dir, name)
    await rm(target, { recursive: true, force: true })
    await mkdir(target)
    for (const [file, contents] of Object.entries(files)) await writeFile(join(target, file), contents)
    return target
  }

  await t.test('an invalid record fails the load, naming the record and field', async () => {
    const target = await writeDir('bad-record', {
      'students.json': JSON.stringify([makeAutomation({ id: 'good' })]),
      'coaches.json': JSON.stringify([{ ...makeAutomation({ id: 'broken', niche: 'Coaches' }), kind: 'all' }]),
    })
    assert.throws(() => createJsonAutomations({ dir: target }), (error: Error) => {
      assert.match(error.message, /broken/)
      assert.match(error.message, /kind/)
      return true
    })
  })

  await t.test('an invalid record via the records seam fails the same way', () => {
    assert.throws(() => createJsonAutomations({ records: [{ id: 'nope' }] }), /nope/)
  })

  await t.test('a file that is not an array names the file', async () => {
    const target = await writeDir('not-array', { 'students.json': '{"records": []}' })
    assert.throws(() => createJsonAutomations({ dir: target }), /students\.json must be a JSON array/)
  })

  await t.test('a file that is not JSON names the file', async () => {
    const target = await writeDir('not-json', { 'students.json': '[{' })
    assert.throws(() => createJsonAutomations({ dir: target }), /students\.json could not be read as JSON/)
  })

  await t.test('a missing directory fails rather than loading nothing', () => {
    assert.throws(() => createJsonAutomations({ dir: join(dir, 'does-not-exist') }), /Could not read the automations directory/)
  })

  await t.test('the same slug twice in one niche fails; across niches it loads', async () => {
    const clash = await writeDir('clash', {
      'students.json': JSON.stringify([
        makeAutomation({ id: 'a', slug: 'same' }),
        makeAutomation({ id: 'b', slug: 'same' }),
      ]),
    })
    assert.throws(() => createJsonAutomations({ dir: clash }), /Students\/same.*duplicate/)

    const split = await writeDir('split', {
      'students.json': JSON.stringify([makeAutomation({ id: 'a', slug: 'same' })]),
      'coaches.json': JSON.stringify([makeAutomation({ id: 'b', slug: 'same', niche: 'Coaches' })]),
    })
    assert.equal(await createJsonAutomations({ dir: split }).size(), 2)
  })

  await t.test('only .json files are read', async () => {
    const target = await writeDir('mixed', {
      'students.json': JSON.stringify([makeAutomation()]),
      'README.md': 'not data',
    })
    assert.equal(await createJsonAutomations({ dir: target }).size(), 1)
  })
})

/* ═══ 3. The committed import ══════════════════════════════════════════════ */

await test('the imported automations', async (t) => {
  const files = readdirSync(DATA_DIR).filter((name) => name.endsWith('.json')).sort()
  const perFile = new Map(
    files.map((name) => [name, JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as Array<{ niche: string }>]),
  )
  const repo = createJsonAutomations()

  await t.test('all 25 per-niche files load', () => {
    assert.equal(files.length, 25)
    assert.equal(files.length, NICHES.length, 'one file per niche in the vocabulary')
  })

  await t.test('the total record count is the sum of the files — 1,560 as imported', async () => {
    const sum = [...perFile.values()].reduce((n, records) => n + records.length, 0)
    assert.equal(await repo.size(), sum)
    // Pinned to the committed import. A re-import that changes it should
    // change this number in the same commit.
    assert.equal(sum, 1560)
  })

  await t.test('each file holds exactly one niche, and its name is that niche', () => {
    for (const [name, records] of perFile) {
      const niches = new Set(records.map((record) => record.niche))
      assert.equal(niches.size, 1, `${name} mixes niches`)
      assert.equal(`${slugify([...niches][0] ?? '')}.json`, name)
    }
  })

  await t.test('every niche in the vocabulary has automations', async () => {
    for (const niche of NICHES) {
      assert.ok((await repo.listByNiche(niche)).length > 0, `${niche} is empty`)
    }
  })

  await t.test('the one cross-niche slug resolves per niche', async () => {
    const slug = 'i-want-a-chatbot-on-my-website-that-can-answer-customer'
    const contractors = await repo.findBySlug('Contractors & Home Services', slug)
    const small = await repo.findBySlug('Small Businesses', slug)
    assert.ok(contractors && small)
    assert.notEqual(contractors.id, small.id)
  })

  await t.test('the container builds the real repository', async () => {
    assert.equal(await testContainer().automations.size(), 1560)
  })
})
