/*
 * ToolCatalogueRepository.create() — the review script's one write.
 *
 * The case that matters most: a record the server would refuse at boot must
 * be refused HERE, at write time, through the identical parse function —
 * never written, never partially applied.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import type { ToolCatalogueRepository } from '../src/catalogue/repository.ts'
import { isApiError } from '../src/domain/errors.ts'
import { fixtureCatalogue, makeTool } from './helpers.ts'

async function withFileCatalogue(
  seed: unknown,
  body: (catalogue: ToolCatalogueRepository, filePath: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'catalogue-create-test-'))
  try {
    const filePath = join(dir, 'catalogue-fixture.json')
    await writeFile(filePath, JSON.stringify(seed), 'utf8')
    await body(createJsonToolCatalogue({ path: filePath }), filePath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

await test('ToolCatalogueRepository.create()', async (t) => {
  await t.test('a valid tool is written to disk and immediately findable in this process', async () => {
    await withFileCatalogue([], async (catalogue, filePath) => {
      const tool = makeTool({ id: 'new-tool', slug: 'new-tool' })
      const created = await catalogue.create(tool)
      assert.equal(created.slug, 'new-tool')

      // Findable without reconstructing the catalogue — the in-memory
      // indexes must be updated, not just the file.
      assert.ok(await catalogue.findBySlug('new-tool'))
      assert.ok(await catalogue.findById('new-tool'))

      // And genuinely on disk, not just in the returned value.
      const onDisk = JSON.parse(await readFile(filePath, 'utf8')) as unknown[]
      assert.equal(onDisk.length, 1)
    })
  })

  await t.test('size() reflects a newly created active tool', async () => {
    await withFileCatalogue([], async (catalogue) => {
      assert.equal(await catalogue.size(), 0)
      await catalogue.create(makeTool({ id: 'counted', slug: 'counted', status: 'active' }))
      assert.equal(await catalogue.size(), 1)
    })
  })

  await t.test('an invalid tool is refused, and nothing is written', async () => {
    await withFileCatalogue([], async (catalogue, filePath) => {
      // summary under the schema's 40-character floor.
      const invalid = makeTool({ id: 'too-short', slug: 'too-short', summary: 'Too short.' })

      await assert.rejects(
        () => catalogue.create(invalid),
        (error: unknown) => {
          assert.ok(isApiError(error))
          return true
        },
      )

      assert.equal(await catalogue.findBySlug('too-short'), undefined, 'must not be indexed')
      const onDisk = JSON.parse(await readFile(filePath, 'utf8')) as unknown[]
      assert.equal(onDisk.length, 0, 'the file must be untouched')
      assert.equal(await catalogue.size(), 0)
    })
  })

  await t.test('a duplicate slug against an existing record is refused', async () => {
    await withFileCatalogue([makeTool({ id: 'existing', slug: 'existing' })], async (catalogue) => {
      await assert.rejects(() => catalogue.create(makeTool({ id: 'existing', slug: 'existing' })))
      assert.equal((await catalogue.search({ status: 'all', limit: 100 })).items.length, 1)
    })
  })

  await t.test('create() refuses on a catalogue built from in-memory records with no real file', async () => {
    const catalogue = fixtureCatalogue([makeTool()])
    await assert.rejects(() => catalogue.create(makeTool({ id: 'other', slug: 'other' })))
  })
})
