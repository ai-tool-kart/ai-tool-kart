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
        /(const|let)\s+(TOOL_CATEGORIES|WORKFLOW_STAGES|PRICING_TIERS|ROLES|NICHES|CATALOGUE_KINDS)\s*=/.test(
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

/*
 * The usage-story boundary.
 *
 * stories/ is a second content source behind a second port, and it earns the
 * same guards as the catalogue for the same reason: the JSON file is a V1
 * detail, and every module that learns it is a file that has to be rewritten
 * when the stories move into a table or a CMS.
 *
 * The extra rule here is the one about DIRECTION. A story references the
 * catalogue by slug and the catalogue knows nothing of stories. If stories/ ever
 * imported the catalogue it would stop being content and start being a join —
 * and the tool metadata the section is specifically built not to duplicate would
 * have somewhere to be duplicated into.
 */
await test('the usage-story boundary holds', async (t) => {
  const STORIES_DIR = join(SRC, 'stories')
  const storyFiles = files.filter((file) => file.startsWith(STORIES_DIR))

  await t.test('the scan found the stories module', () => {
    assert.ok(storyFiles.length >= 4, `expected stories/, found ${storyFiles.length} files`)
  })

  await t.test('nothing outside stories/ names stories.json', () => {
    const offenders = files
      .filter((file) => !file.startsWith(STORIES_DIR))
      .filter((file) => readFileSync(file, 'utf8').includes('stories.json'))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'only src/stories/ may know the stories are stored as JSON')
  })

  await t.test('only the JSON adapter reads it, even inside stories/', () => {
    const offenders = storyFiles
      .filter((file) => !file.endsWith('json.ts'))
      .filter((file) => codeOf(file).includes('stories.json'))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'the file read belongs in stories/json.ts alone')
  })

  await t.test('nothing outside stories/ imports from stories/data/', () => {
    const offenders = files
      .filter((file) => !file.startsWith(STORIES_DIR))
      .filter((file) => /stories\/data/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('stories never import the catalogue', () => {
    // The reference is ONE-WAY: a story holds slugs, and resolving them is the
    // client's job against a catalogue it has already read. An import here is
    // how tool metadata gets copied into a second response shape.
    const offenders = storyFiles
      .filter((file) => /from '\.\.\/catalogue\//.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'a story references tools by slug and resolves nothing')
  })

  await t.test('the catalogue never imports the stories', () => {
    // ...and the reverse, which would be worse: the tool port must not grow a
    // content API the PostgreSQL adapter would have to implement.
    const offenders = files
      .filter((file) => file.startsWith(CATALOGUE_DIR))
      .filter((file) => /from '\.\.\/stories\//.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('stories never import express or the HTTP layer', () => {
    const offenders = storyFiles
      .filter((file) => /from 'express'|from '\.\.\/http\//.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('routes never import the JSON story adapter', () => {
    const offenders = files
      .filter((file) => file.startsWith(join(SRC, 'http')))
      .filter((file) => /createJsonUsageStoryRepository|stories\/json/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'routes receive a repository from the container')
  })

  await t.test('container.ts is the only module naming a concrete story adapter', () => {
    const offenders = files
      .filter((file) => !file.startsWith(STORIES_DIR))
      .filter((file) => file !== join(SRC, 'container.ts'))
      .filter((file) => codeOf(file).includes('createJsonUsageStoryRepository('))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })
})

/*
 * The work-savings boundary.
 *
 * A third content source behind a third port, and it earns the same guards for
 * the same reason. The rule specific to this one is that it must contain NO
 * ARITHMETIC: the moment a figure here is computed rather than written, the
 * section stops presenting editorial estimates and starts making a quantitative
 * claim the project has no measurement behind.
 */
await test('the work-savings boundary holds', async (t) => {
  const SAVINGS_DIR = join(SRC, 'savings')
  const savingsFiles = files.filter((file) => file.startsWith(SAVINGS_DIR))

  await t.test('the scan found the savings module', () => {
    assert.ok(savingsFiles.length >= 4, `expected savings/, found ${savingsFiles.length} files`)
  })

  await t.test('nothing outside savings/ names workSavings.json', () => {
    const offenders = files
      .filter((file) => !file.startsWith(SAVINGS_DIR))
      .filter((file) => readFileSync(file, 'utf8').includes('workSavings.json'))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'only src/savings/ may know the estimates are stored as JSON')
  })

  await t.test('only the JSON adapter reads it, even inside savings/', () => {
    const offenders = savingsFiles
      .filter((file) => !file.endsWith('json.ts'))
      .filter((file) => codeOf(file).includes('workSavings.json'))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'the file read belongs in savings/json.ts alone')
  })

  await t.test('nothing outside savings/ imports from savings/data/', () => {
    const offenders = files
      .filter((file) => !file.startsWith(SAVINGS_DIR))
      .filter((file) => /savings\/data/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('the estimates are written, never computed', () => {
    /*
     * No arithmetic on a figure anywhere in the module. This is the guard that
     * keeps "See What AI Can Save You" an editorial section rather than a
     * calculator: a rate multiplied by an hours field would be a financial claim
     * with nothing behind it, and it would arrive one small commit at a time.
     *
     * The schema's own bounds checks are the documented exception — they compare
     * against limits, they do not derive a figure.
     */
    const offenders = savingsFiles
      .filter((file) => !file.endsWith('schema.ts'))
      .filter((file) => /hoursSavedPerWeek\s*[*/+-]|[*/]\s*hoursSavedPerWeek/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'a savings figure must be written, not calculated')
  })

  await t.test('savings never import the catalogue adapter or the HTTP layer', () => {
    // It reads ROLES from the taxonomy — vocabulary is configuration and that
    // import is the whole point of `catalogueRole` — but it must not reach the
    // repository, the data files, or express.
    const offenders = savingsFiles
      .filter((file) =>
        /catalogue\/(json|data|repository)|from 'express'|from '\.\.\/http\//.test(codeOf(file)),
      )
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('the catalogue never imports the savings', () => {
    const offenders = files
      .filter((file) => file.startsWith(CATALOGUE_DIR))
      .filter((file) => /from '\.\.\/savings\//.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('routes never import the JSON savings adapter', () => {
    const offenders = files
      .filter((file) => file.startsWith(join(SRC, 'http')))
      .filter((file) => /createJsonWorkSavingsRepository|savings\/json/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'routes receive a repository from the container')
  })

  await t.test('container.ts is the only module naming a concrete savings adapter', () => {
    const offenders = files
      .filter((file) => !file.startsWith(SAVINGS_DIR))
      .filter((file) => file !== join(SRC, 'container.ts'))
      .filter((file) => codeOf(file).includes('createJsonWorkSavingsRepository('))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })
})

/*
 * The temporary LLM layer.
 *
 * server/src/llm/ is an explicitly temporary copy of the News Agent's LLM
 * infrastructure, and ASSISTANT_ARCHITECTURE_PLAN.md §12 is emphatic about the
 * risk: "Do not let the interface drift." Phase H MOVES this directory into
 * shared/llm, where the News Agent — which has no HTTP server, no catalogue and
 * no retrieval — will import it.
 *
 * So every dependency this directory grows on a server-only concern is a file
 * that has to be untangled during that move. These guards make the untangling
 * unnecessary by preventing the coupling in the first place.
 */
await test('the temporary LLM layer stays liftable into shared/', async (t) => {
  const LLM_DIR = join(SRC, 'llm')
  const llmFiles = files.filter((file) => file.startsWith(LLM_DIR))

  await t.test('the scan found the LLM layer', () => {
    assert.ok(llmFiles.length >= 8, `expected the llm/ tree, found ${llmFiles.length} files`)
  })

  await t.test('every file carries the drift warning', () => {
    // The header is the only thing telling the next reader that this directory
    // is scheduled for deletion rather than for extension.
    const missing = llmFiles
      .filter((file) => {
        const head = readFileSync(file, 'utf8').slice(0, 1200)
        return !/TEMPORARY/.test(head) || !/Phase H/.test(head)
      })
      .map((file) => relative(SRC, file))

    assert.deepEqual(missing, [], 'each llm/ file must state that Phase H deletes it')
  })

  await t.test('it never imports the catalogue, retrieval or HTTP layers', () => {
    // The News Agent has none of these. An import here is a file that cannot
    // move to shared/ without being rewritten.
    const offenders = llmFiles
      .filter((file) => /from '\.\.\/(catalogue|retrieval|http)\//.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('it never imports express or anything HTTP-shaped', () => {
    const offenders = llmFiles
      .filter((file) => /from 'express'|from 'node:http'/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('the LLM layer throws LLMError, never the HTTP ApiError', () => {
    /*
     * domain/errors.ts models errors by HTTP STATUS. An LLM client that threw
     * one could not be shared with a package that has no HTTP layer, so llm/
     * carries its own vocabulary and Phase E maps it at the route boundary.
     *
     * factory.ts is the documented exception: provider selection is a
     * CONFIGURATION failure at boot, and the News Agent's factory throws its own
     * configError for the same reason.
     */
    const offenders = llmFiles
      .filter((file) => !file.endsWith('factory.ts'))
      .filter((file) => /ApiError|from '\.\.\/domain\/errors/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('container.ts is the only module naming a concrete provider', () => {
    const offenders = files
      .filter((file) => !file.startsWith(LLM_DIR))
      .filter((file) => file !== join(SRC, 'container.ts'))
      .filter((file) => /createMockProvider\(|createProvider\(/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'providers are wired at the composition root')
  })

  await t.test('no vendor SDK has crept in', () => {
    // The production provider is an open decision (§12). An import of a vendor
    // SDK would settle it silently.
    const vendors = /@anthropic-ai|from 'openai'|@google\/|@azure\/|from 'cohere/
    const offenders = files
      .filter((file) => vendors.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('scoring weights and task limits stay in config', () => {
    // Same rule Phase C applied to SCORE_WEIGHTS: tuning must not mean editing
    // logic. §12 notes these move to shared/llm with the code in Phase H.
    const client = codeOf(join(LLM_DIR, 'client.ts'))
    assert.match(client, /LLM_RETRY\.schemaAttempts/)
    assert.match(client, /TASK_MODEL_CLASS\[/)
    assert.match(client, /TASK_MAX_OUTPUT_TOKENS\[/)
    assert.equal(
      /attempt <= 3|attempts = 3/.test(client),
      false,
      'the attempt count must come from config, never a literal',
    )
  })
})

/*
 * The assistant module.
 *
 * Phase E's engine sits between retrieval, the catalogue and the LLM layer, and
 * is therefore the most tempting place in the server to reach through a
 * boundary — one import of the JSON adapter would make the PostgreSQL migration
 * touch the recommendation logic, and one import of express would make the
 * engine untestable without a socket.
 *
 * These guards are the same shape as the ones above, for the same reason: an
 * architectural rule defended only by comments is a rule that has already been
 * broken somewhere nobody looked.
 */
await test('the assistant module keeps its dependencies pointing inward', async (t) => {
  const ASSISTANT_DIR = join(SRC, 'assistant')
  const LLM_DIR = join(SRC, 'llm')
  const assistantFiles = files.filter((file) => file.startsWith(ASSISTANT_DIR))

  await t.test('the scan found the assistant module', () => {
    assert.ok(assistantFiles.length >= 6, `expected assistant/, found ${assistantFiles.length}`)
  })

  await t.test('it never imports express or anything HTTP-shaped', () => {
    // The engine is driven by a route, not the other way round. An express
    // import here would mean a turn could not be run from a test.
    const offenders = assistantFiles
      .filter((file) => /from 'express'|from '\.\.\/http\//.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('it reaches the catalogue only through the port', () => {
    const offenders = assistantFiles
      .filter((file) => /catalogue\/(json|data)/.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'hydration goes through ToolCatalogueRepository')
  })

  await t.test('the LLM layer never imports the assistant', () => {
    /*
     * The reverse direction, and the one that would hurt in Phase H. src/llm/
     * moves to shared/llm, where the News Agent imports it — and the News Agent
     * has no assistant, no plan and no catalogue. An import here would turn that
     * move into a rewrite.
     */
    const offenders = files
      .filter((file) => file.startsWith(LLM_DIR))
      .filter((file) => /from '\.\.?\/(\.\.\/)?assistant\//.test(codeOf(file)))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [])
  })

  await t.test('container.ts is the only module that builds an engine', () => {
    const offenders = files
      .filter((file) => !file.startsWith(ASSISTANT_DIR))
      .filter((file) => file !== join(SRC, 'container.ts'))
      .filter((file) => codeOf(file).includes('createAssistantEngine('))
      .map((file) => relative(SRC, file))

    assert.deepEqual(offenders, [], 'routes receive an engine, they do not wire one')
  })

  await t.test('the response caps live in config, not scattered through the schema', () => {
    // Same rule Phase C applied to SCORE_WEIGHTS and Phase D to the retry count:
    // tuning a limit must not mean editing the logic that enforces it.
    const schema = codeOf(join(ASSISTANT_DIR, 'schema.ts'))
    assert.match(schema, /ASSISTANT\./)
    assert.equal(
      /\.max\(\s*\d/.test(schema),
      false,
      'a cap must come from config/limits.ts, never a literal',
    )
  })

  await t.test('grounding does no IO, so its guarantee is provable', () => {
    const ground = codeOf(join(ASSISTANT_DIR, 'ground.ts'))
    assert.equal(/await |async |from 'node:/.test(ground), false)
  })
})
