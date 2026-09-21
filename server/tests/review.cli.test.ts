/*
 * review/cli.ts and review/listInput.ts — the fixes from the second round
 * of manual review-script testing:
 *
 *   1. case-insensitive matching against a closed vocabulary, canonical
 *      casing stored ("student" -> "Student")
 *   2. list-field prompts say "comma-separated" and trim each value
 *   4. useCases enforced against its own closed vocabulary the same way
 *      roles/stages are
 *   5. a cancel at the pre-write confirmation writes nothing at all
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROLES, USE_CASES } from '../src/catalogue/taxonomy.ts'
import { createJsonToolCatalogue } from '../src/catalogue/json.ts'
import type { ToolCatalogueRepository } from '../src/catalogue/repository.ts'
import { confirmTool, promptClosedListField, promptOpenListField, promptField, runReview } from '../src/review/cli.ts'
import { resolveListInput, splitList } from '../src/review/listInput.ts'
import type { Ask } from '../src/review/prompt.ts'
import type { ReviewedFields } from '../src/review/buildTool.ts'
import { createJsonSubmissionStore } from '../src/submissions/store.json.ts'
import type { SubmissionStore } from '../src/submissions/store.ts'
import { makeSubmission, testContainer } from './helpers.ts'

/** A scripted Ask: answers `queued`, in order, and records every prompt it was given. */
function scriptedAsk(answers: string[]): { ask: Ask; prompts: string[] } {
  const prompts: string[] = []
  const queue = [...answers]
  const ask: Ask = async (prompt) => {
    prompts.push(prompt)
    return queue.shift() ?? ''
  }
  return { ask, prompts }
}

/** Runs `body`, capturing every console.log call it makes (the "from: ..." header is printed this way, not through Ask). */
async function captureConsoleLog(body: () => Promise<void>): Promise<string[]> {
  const lines: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    await body()
  } finally {
    console.log = original
  }
  return lines
}

const FIELDS: ReviewedFields = {
  mono: 'Fx',
  slug: 'fixture-tool',
  price: '—',
  pop: 40,
  roles: ['Developer'],
  stages: ['build'],
  useCases: ['Draft an article'],
  tags: ['writing'],
  summary: 'A fixture tool used to exercise the review CLI in tests, well past the forty-character floor.',
}

await test('resolveListInput', async (t) => {
  await t.test('matches case-insensitively and stores the allowed list\'s own casing', () => {
    const { resolved, invalid } = resolveListInput(['student'], ROLES)
    assert.deepEqual(resolved, ['Student'])
    assert.deepEqual(invalid, [])
  })

  await t.test('mixed case and already-correct case both resolve the same way', () => {
    assert.deepEqual(resolveListInput(['STUDENT'], ROLES).resolved, ['Student'])
    assert.deepEqual(resolveListInput(['Student'], ROLES).resolved, ['Student'])
  })

  await t.test('an unmatched entry is reported invalid, verbatim as typed', () => {
    const { resolved, invalid } = resolveListInput(['Wizard'], ROLES)
    assert.deepEqual(resolved, [])
    assert.deepEqual(invalid, ['Wizard'])
  })

  await t.test('duplicates that resolve to the same canonical value collapse to one', () => {
    const { resolved } = resolveListInput(['student', 'Student', 'STUDENT'], ROLES)
    assert.deepEqual(resolved, ['Student'])
  })
})

await test('splitList', () => {
  assert.deepEqual(splitList(' Developer ,  Student,Writer  '), ['Developer', 'Student', 'Writer'])
  assert.deepEqual(splitList('a,,b'), ['a', 'b'])
})

await test('promptClosedListField', async (t) => {
  await t.test('accepts a case-insensitive answer and returns the canonical value', async () => {
    const { ask } = scriptedAsk(['student'])
    const result = await promptClosedListField(ask, 'roles', [], ROLES)
    assert.deepEqual(result, ['Student'])
  })

  await t.test('the prompt says how to enter several values', async () => {
    const { ask, prompts } = scriptedAsk(['Developer'])
    await promptClosedListField(ask, 'roles', [], ROLES)
    assert.ok(prompts.some((p) => p.includes('comma-separated')), 'expected a "comma-separated" hint in a prompt')
  })

  await t.test('the allowed-values list is shown once, not repeated on a retry', async () => {
    const { ask } = scriptedAsk(['not-a-role', 'Developer'])
    const logs = await captureConsoleLog(async () => {
      await promptClosedListField(ask, 'roles', [], ROLES)
    })
    const withList = logs.filter((line) => line.includes(ROLES.join(', ')))
    assert.equal(withList.length, 1, `expected the allowed list exactly once, saw it ${withList.length} times`)

    // The retry itself must still say something — just not the whole list.
    const errorLines = logs.filter((line) => line.includes('Not in the allowed list'))
    assert.equal(errorLines.length, 1)
  })

  await t.test('extra whitespace around commas is trimmed', async () => {
    const { ask } = scriptedAsk(['  Developer  ,  Student  '])
    const result = await promptClosedListField(ask, 'roles', [], ROLES)
    assert.deepEqual(result, ['Developer', 'Student'])
  })

  await t.test('useCases is enforced against its own closed vocabulary the same way', async () => {
    const { ask } = scriptedAsk(['not a real use case', 'draft an article'])
    const result = await promptClosedListField(ask, 'useCases', [], USE_CASES)
    assert.deepEqual(result, ['Draft an article'])
  })
})

await test('promptOpenListField', async (t) => {
  await t.test('the prompt says how to enter several values, and trims each one', async () => {
    const { ask, prompts } = scriptedAsk(['  writing  ,  ai  '])
    const result = await promptOpenListField(ask, 'tags', [])
    assert.ok(prompts.some((p) => p.includes('comma-separated')))
    assert.deepEqual(result, ['writing', 'ai'])
  })
})

await test('confirmTool', async (t) => {
  await t.test('"cancel" returns without writing anything, and stops after the first prompt', async () => {
    const submission = { ...makeSubmission(), id: 'sub-1', status: 'pending' as const, createdAt: '2026-01-01T00:00:00.000Z' }
    const { ask } = scriptedAsk(['c'])
    const outcome = await confirmTool(ask, submission, FIELDS, '2026-09-21')
    assert.deepEqual(outcome, { action: 'cancel' })
  })

  await t.test('"write" returns the fields as they stood', async () => {
    const submission = { ...makeSubmission(), id: 'sub-1', status: 'pending' as const, createdAt: '2026-01-01T00:00:00.000Z' }
    const { ask } = scriptedAsk(['w'])
    const outcome = await confirmTool(ask, submission, FIELDS, '2026-09-21')
    assert.equal(outcome.action, 'write')
    if (outcome.action === 'write') assert.deepEqual(outcome.fields, FIELDS)
  })

  await t.test('"edit" re-prompts one named field and shows the record again before asking', async () => {
    const submission = { ...makeSubmission(), id: 'sub-1', status: 'pending' as const, createdAt: '2026-01-01T00:00:00.000Z' }
    const { ask } = scriptedAsk(['e', 'mono', 'Zz', 'w'])
    const outcome = await confirmTool(ask, submission, FIELDS, '2026-09-21')
    assert.equal(outcome.action, 'write')
    if (outcome.action === 'write') {
      assert.equal(outcome.fields.mono, 'Zz')
      // Every other field survives an edit to just one.
      assert.equal(outcome.fields.slug, FIELDS.slug)
    }
  })
})

async function withFixture(
  body: (ctx: { catalogue: ToolCatalogueRepository; store: SubmissionStore }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'review-cli-test-'))
  try {
    const catalogueFile = join(dir, 'catalogue-fixture.json')
    await writeFile(catalogueFile, '[]', 'utf8')
    const catalogue = createJsonToolCatalogue({ path: catalogueFile })
    const store = createJsonSubmissionStore(join(dir, 'submissions-fixture.json'))
    await body({ catalogue, store })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

await test('runReview — cancelling at the confirmation step', async (t) => {
  await t.test('writes nothing to the catalogue and leaves the submission pending', async () => {
    await withFixture(async ({ catalogue, store }) => {
      await store.create(makeSubmission({ audience: undefined, tags: ['coding'] }))

      const { ask } = scriptedAsk([
        'a', // approve
        '', // mono — accept proposal
        '', // price — accept
        '', // pop — accept
        'Developer', // roles — no default (no audience), must type
        'build', // stages — no default, must type
        'Draft an article', // useCases — no default, must type
        '', // tags — accept proposed (from submission.tags)
        '', // summary — accept proposed
        '', // slug — accept proposed
        'c', // cancel at the confirmation step
      ])

      const container = testContainer(undefined, undefined, catalogue, undefined, undefined, undefined, store)
      await runReview(container, { dryRun: false }, ask)

      const page = await catalogue.search({ status: 'all', limit: 100 })
      assert.equal(page.items.length, 0, 'nothing should have been written to the catalogue')

      const stillPending = await store.list({ status: 'pending' })
      assert.equal(stillPending.length, 1, 'the submission must still be pending')
    })
  })
})
