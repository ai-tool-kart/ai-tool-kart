/*
 * The catalogue repository boundary, enforced mechanically.
 *
 * ASSISTANT_ARCHITECTURE_PLAN.md §6.1 states the rule and then says it is
 * "worth an actual lint check", because an architectural boundary defended only
 * by comments is a boundary that has already been crossed somewhere nobody
 * looked. This is that check.
 *
 * The acceptance criterion from §14, executed as a test rather than typed into a
 * terminal once:
 *
 *   grep -r "tools.json" server/src --exclude-dir=catalogue   → empty
 *
 * A failure here is not a style nit. Every module that learns the catalogue is a
 * file is a module that must be rewritten when it becomes a table, and the whole
 * point of the port is that the PostgreSQL migration touches one file.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const CATALOGUE_DIR = join(SRC, 'catalogue')

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

const files = await sourceFiles(SRC)

/**
 * A file's code with comments removed.
 *
 * Used by every check that is about what a module IMPORTS or CALLS. Without it
 * these guards fire on their own prose: the sentence "never import anything
 * under catalogue/data/" in a route header is not an import of catalogue/data.
 *
 * The literal `tools.json` check below deliberately does NOT strip comments — it
 * reproduces the plan's acceptance criterion, a plain grep over the source, and
 * a mention of the filename in a comment outside catalogue/ is itself a sign the
 * boundary has started leaking into someone's mental model.
 */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

await test('the catalogue storage boundary holds', async (t) => {
  await t.test('the scan actually found the source tree', () => {
    // Without this, a broken path would make every assertion below pass
    // vacuously — the worst possible outcome for a guard test.
    assert.ok(files.length > 10, `expected to scan the server source, found ${files.length} files`)
  })

  await t.test('nothing outside catalogue/ names tools.json', () => {
    const offenders = files
      .filter((file) => !file.startsWith(CATALOGUE_DIR))
      .filter((file) => readFileSync(file, 'utf8').includes('tools.json'))
      .map((file) => relative(SRC, file))

    assert.deepEqual(
      offenders,
      [],
      'only src/catalogue/ may know the catalogue is stored as JSON',
    )
  })

  await t.test('only the JSON adapter reads it, even inside catalogue/', () => {
    const offenders = files
      .filter((file) => file.startsWith(CATALOGUE_DIR) && !file.endsWith('json.ts'))
      // codeOf, not raw text: taxonomy.ts and index.ts both DOCUMENT the rule,
      // and a guard that fires on the sentence stating it is worse than useless.
      .filter((file) => codeOf(file).includes('tools.json'))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'the file read belongs in catalogue/json.ts alone')
  })

  await t.test('nothing outside catalogue/ imports from catalogue/data/', () => {
    const offenders = files
      .filter((file) => !file.startsWith(CATALOGUE_DIR))
      .filter((file) => /catalogue\/data/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('retrieval touches the filesystem nowhere', () => {
    // RetrievalService must depend on the port and nothing else. A node:fs
    // import here would mean it had grown its own path to the data.
    const offenders = files
      .filter((file) => file.startsWith(join(SRC, 'retrieval')))
      .filter((file) => /from '(node:fs|node:path)/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('routes never import the JSON adapter', () => {
    const offenders = files
      .filter((file) => file.startsWith(join(SRC, 'http')))
      .filter((file) => /createJsonToolCatalogue|catalogue\/json/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'routes receive a repository from the container')
  })

  await t.test('container.ts is the only module naming a concrete implementation', () => {
    // ASSISTANT_ARCHITECTURE_PLAN.md §6.4: the composition root is the single
    // line that changes when the catalogue moves to PostgreSQL.
    const offenders = files
      .filter((file) => !file.startsWith(CATALOGUE_DIR))
      .filter((file) => file !== join(SRC, 'container.ts'))
      .filter((file) => codeOf(file).includes('createJsonToolCatalogue('))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('the vocabulary has exactly one definition', () => {
    // §5.3: catalogue/taxonomy.ts owns every closed list. A second definition
    // anywhere is how the three competing category systems arose originally.
    const offenders = files
      .filter((file) => file !== join(CATALOGUE_DIR, 'taxonomy.ts'))
      .filter((file) =>
        /(const|let)\s+(TOOL_CATEGORIES|WORKFLOW_STAGES|PRICING_TIERS|ROLES)\s*=/.test(
          codeOf(file),
        ),
      )
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'taxonomy.ts is the single source of truth')
  })

  await t.test('scoring weights live in config, not scattered through the scorer', () => {
    // §9 requires the weights to be configuration. A numeric literal multiplying
    // a signal inside score.ts would mean tuning relevance requires editing
    // scoring logic, and "why is this ranked here" stops having one answer.
    const body = codeOf(join(SRC, 'retrieval', 'score.ts'))
    assert.equal(
      /SCORE_WEIGHTS\.\w+\s*\*\s*\d/.test(body),
      false,
      'a weight must never be multiplied by a literal in the scorer',
    )
    assert.ok(body.includes('SCORE_WEIGHTS.'), 'weights are read from config/limits.ts')
  })
})
