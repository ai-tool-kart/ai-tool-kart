/*
 * deriveSteps — SPEC-automations.md §5, slice 4.
 *
 * The three default steps, built from the record alone. Pure, so every case
 * is a direct call on a `makeAutomation()` fixture.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { DERIVED_STEP_TITLES, deriveSteps } from '../src/automations/deriveSteps.ts'
import type { Automation } from '../src/automations/types.ts'
import { makeAutomation } from './helpers.ts'

const AUTOMATION = makeAutomation({
  id: 'plan-my-week',
  tools: [
    {
      name: 'Motion',
      url: 'https://www.usemotion.com',
      accessNote: '7-day trial requires a card upfront',
    },
  ],
  samplePrompt: 'Plan my week around three exams and a part-time job.',
  workflowSummary: 'Motion schedules tasks around your fixed commitments.',
})

await test('deriveSteps', async (t) => {
  await t.test('three steps, in order, with the right content', () => {
    const [open, prompt, result, ...rest] = deriveSteps(AUTOMATION)

    assert.deepEqual(rest, [])

    assert.equal(open?.title, DERIVED_STEP_TITLES.openTool)
    assert.equal(open?.toolName, 'Motion')
    assert.equal(open?.body, 'Open Motion.')
    assert.equal(open?.tip, '7-day trial requires a card upfront')

    assert.equal(prompt?.title, DERIVED_STEP_TITLES.usePrompt)
    assert.equal(prompt?.prompt, 'Plan my week around three exams and a part-time job.')

    assert.equal(result?.title, DERIVED_STEP_TITLES.result)
    assert.equal(result?.body, 'Motion schedules tasks around your fixed commitments.')
  })

  await t.test('the titles are the ones §5 names', () => {
    assert.deepEqual(
      deriveSteps(AUTOMATION).map((step) => step.title),
      ['Open the tool', 'Use this prompt', "What you'll get"],
    )
  })

  await t.test('authored steps are ignored — the caller chooses, not deriveSteps', () => {
    const authored = makeAutomation({
      ...AUTOMATION,
      steps: [{ title: 'Authored step', body: 'Written by an editor.' }],
    })
    const before = structuredClone(authored)

    assert.deepEqual(deriveSteps(authored), deriveSteps(AUTOMATION))
    assert.deepEqual(authored, before, 'the record is not modified')
    assert.equal((authored.steps ?? deriveSteps(authored))[0]?.title, 'Authored step')
  })

  await t.test('a tool with no accessNote omits the tip', () => {
    const [open] = deriveSteps(
      makeAutomation({ tools: [{ name: 'Notability', url: 'https://notability.com' }] }),
    )
    assert.ok(open)
    assert.equal('tip' in open, false)
  })

  await t.test('with several tools, the first is the one used', () => {
    const steps = deriveSteps(
      makeAutomation({
        tools: [
          { name: 'Notta', url: 'https://www.notta.ai' },
          { name: 'DeepL', url: 'https://www.deepl.com', accessNote: 'Free tier caps length' },
        ],
      }),
    )
    assert.equal(steps[0]?.toolName, 'Notta')
    assert.equal('tip' in (steps[0] ?? {}), false, "the second tool's accessNote is not used")
    assert.doesNotMatch(JSON.stringify(steps), /DeepL/)
  })

  await t.test('the same record always derives the same steps', () => {
    assert.deepEqual(deriveSteps(AUTOMATION), deriveSteps(AUTOMATION))
  })

  await t.test('a record with no tools is a caller bug, not an empty step list', () => {
    const invalid = { ...AUTOMATION, tools: [] } as Automation
    assert.throws(() => deriveSteps(invalid), /plan-my-week/)
  })
})
