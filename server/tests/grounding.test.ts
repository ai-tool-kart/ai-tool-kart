/*
 * The grounding gate.
 *
 * ASSISTANT_ARCHITECTURE_PLAN.md §7 states the property this file exists to
 * prove: no input and no model output can cause a tool outside the candidate set
 * to appear in a response. Grounding is a pure function over values, so that is
 * a property a test can pin down exhaustively rather than sample — which is
 * exactly why it was written as a pure function.
 *
 * These cases are about ids only. Whether a grounded id resolves to a real
 * record is hydration's job and is covered in assistant.test.ts.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSISTANT } from '../src/config/limits.ts'
import { GROUNDING_FALLBACK_MESSAGE, groundReply } from '../src/assistant/ground.ts'
import { AssistantReplySchema } from '../src/assistant/schema.ts'
import { makeAssistantReply } from './helpers.ts'

const CANDIDATES = ['alpha-writer', 'beta-editor', 'gamma-coder']

await test('a forged tool id never survives grounding', async (t) => {
  await t.test('a forged id in plan.toolIds is dropped and counted', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Video workflow',
          toolIds: ['beta-editor', 'superfakeai'],
          agents: [],
          workflow: [{ stage: 'edit', toolId: 'beta-editor', why: 'It cuts video.' }],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    assert.deepEqual(result.reply.plan?.toolIds, ['beta-editor'])
    assert.deepEqual(result.droppedToolIds, ['superfakeai'])
    assert.equal(result.degraded, false)
  })

  await t.test('a forged id in a workflow entry is dropped, the stage survives', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Video workflow',
          toolIds: ['beta-editor'],
          agents: [],
          workflow: [
            { stage: 'edit', toolId: 'beta-editor', why: 'It cuts video.' },
            { stage: 'publish', toolId: 'superfakeai', why: 'It publishes.' },
          ],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    // The step is named honestly with no tool, rather than deleted to hide it.
    assert.equal(result.reply.plan?.workflow.length, 2)
    assert.equal(result.reply.plan?.workflow[1]?.stage, 'publish')
    assert.equal(result.reply.plan?.workflow[1]?.toolId, undefined)
    assert.deepEqual(result.droppedToolIds, ['superfakeai'])
  })

  await t.test('valid ids are kept while forged ones are counted', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Mixed',
          toolIds: ['alpha-writer', 'ghost-one', 'beta-editor', 'ghost-two'],
          agents: [],
          workflow: [
            { stage: 'draft', toolId: 'alpha-writer', why: 'a' },
            { stage: 'edit', toolId: 'ghost-two', why: 'b' },
          ],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    assert.deepEqual(result.reply.plan?.toolIds, ['alpha-writer', 'beta-editor'])
    assert.deepEqual(result.droppedToolIds, ['ghost-one', 'ghost-two'])
  })

  await t.test('a repeated forged id is counted once', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Repeats',
          toolIds: ['ghost', 'ghost', 'beta-editor'],
          agents: [],
          workflow: [{ stage: 'edit', toolId: 'ghost', why: 'b' }],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    // A model repeating an invented id is one mistake, not three.
    assert.deepEqual(result.droppedToolIds, ['ghost'])
  })

  await t.test('a duplicated valid id is deduplicated, first occurrence wins', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Repeats',
          toolIds: ['beta-editor', 'alpha-writer', 'beta-editor'],
          agents: [],
          workflow: [{ stage: 'edit', toolId: 'beta-editor', why: 'b' }],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    assert.deepEqual(result.reply.plan?.toolIds, ['beta-editor', 'alpha-writer'])
    assert.deepEqual(result.droppedToolIds, [])
  })

  await t.test('the model ranking is preserved, never re-sorted', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Order',
          toolIds: ['gamma-coder', 'alpha-writer', 'beta-editor'],
          agents: [],
          workflow: [{ stage: 'build', toolId: 'gamma-coder', why: 'b' }],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    // Arrangement is what the model was asked for. Re-sorting would discard it.
    assert.deepEqual(result.reply.plan?.toolIds, ['gamma-coder', 'alpha-writer', 'beta-editor'])
  })
})

await test('a plan grounding cannot save degrades to a clarification', async (t) => {
  const forged = makeAssistantReply({
    message: 'Here are four excellent tools for that.',
    plan: {
      title: 'All invented',
      toolIds: ['ghost-one', 'ghost-two'],
      agents: [],
      workflow: [{ stage: 'edit', toolId: 'ghost-one', why: 'b' }],
      prompts: 'p',
      comparison: 'c',
      steps: ['s'],
    },
  })
  const result = groundReply(forged, CANDIDATES)

  await t.test('the plan is removed entirely, never emptied', () => {
    assert.equal(result.reply.plan, undefined)
    assert.equal(result.degraded, true)
  })

  await t.test('the intent becomes clarify', () => {
    assert.equal(result.reply.intent, 'clarify')
  })

  await t.test("the model's message goes with the plan it described", () => {
    // It was written to introduce a stack that is no longer there.
    assert.equal(result.reply.message, GROUNDING_FALLBACK_MESSAGE)
    assert.doesNotMatch(result.reply.message, /ghost/)
  })

  await t.test('every forged id is still counted', () => {
    assert.deepEqual(result.droppedToolIds, ['ghost-one', 'ghost-two'])
  })

  await t.test('the degraded reply is itself schema-valid', () => {
    // It goes on to be hydrated and serialised like any other reply.
    assert.equal(AssistantReplySchema.safeParse(result.reply).success, true)
  })

  await t.test('the interpretation of the request survives', () => {
    const understood = { role: 'Video Editor', goal: 'ship faster', constraints: ['free only'] }
    const degraded = groundReply(makeAssistantReply({ ...forged, understood }), CANDIDATES)
    assert.deepEqual(degraded.reply.understood, understood)
  })
})

await test('internal consistency between the plan and its workflow', async (t) => {
  await t.test('a real candidate the plan forgot to list is added to it', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Forgot one',
          toolIds: ['beta-editor'],
          agents: [],
          workflow: [
            { stage: 'edit', toolId: 'beta-editor', why: 'a' },
            { stage: 'draft', toolId: 'alpha-writer', why: 'b' },
          ],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    // It is a tool retrieval offered and the model chose; the Tools section is
    // meant to hold the plan's tools, so listing it is the consistent answer.
    assert.deepEqual(result.reply.plan?.toolIds, ['beta-editor', 'alpha-writer'])
    assert.equal(result.reply.plan?.workflow[1]?.toolId, 'alpha-writer')
    assert.deepEqual(result.droppedToolIds, [])
  })

  await t.test('a workflow entry with no tool is left alone', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Unstaffed stage',
          toolIds: ['beta-editor'],
          agents: [],
          workflow: [
            { stage: 'edit', toolId: 'beta-editor', why: 'a' },
            { stage: 'publish', why: 'No candidate covers this step.' },
          ],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    assert.equal(result.reply.plan?.workflow[1]?.toolId, undefined)
    assert.deepEqual(result.droppedToolIds, [])
  })

  await t.test('a real id beyond the tool cap loses its reference but is not "dropped"', () => {
    const many = ['t1', 't2', 't3', 't4', 't5', 't6', 't7']
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Full list',
          toolIds: many.slice(0, ASSISTANT.maxPlanTools),
          agents: [],
          workflow: [{ stage: 'edit', toolId: 't7', why: 'a' }],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      many,
    )

    assert.equal(result.reply.plan?.toolIds.length, ASSISTANT.maxPlanTools)
    assert.equal(result.reply.plan?.workflow[0]?.toolId, undefined)
    // Not a hallucination, so counting it would corrupt the one metric §10.2
    // says matters. It is reported separately, for the log only.
    assert.deepEqual(result.droppedToolIds, [])
    assert.deepEqual(result.unlistedToolIds, ['t7'])
  })
})

await test('an intent that carries no plan cannot smuggle one', async (t) => {
  for (const intent of ['clarify', 'off_topic'] as const) {
    await t.test(`${intent} loses any attached plan`, () => {
      const result = groundReply(makeAssistantReply({ intent }), CANDIDATES)
      assert.equal(result.reply.plan, undefined)
      assert.equal(result.reply.intent, intent)
    })

    await t.test(`a forged id inside a discarded ${intent} plan is still counted`, () => {
      const result = groundReply(
        makeAssistantReply({
          intent,
          plan: {
            title: 'Smuggled',
            toolIds: ['ghost'],
            agents: [],
            workflow: [{ stage: 'edit', toolId: 'ghost-two', why: 'a' }],
            prompts: 'p',
            comparison: 'c',
            steps: ['s'],
          },
        }),
        CANDIDATES,
      )
      assert.equal(result.reply.plan, undefined)
      assert.deepEqual(result.droppedToolIds, ['ghost', 'ghost-two'])
    })
  }

  await t.test('a recommendation with no plan is not a recommendation', () => {
    const { plan: _none, ...withoutPlan } = makeAssistantReply()
    const result = groundReply({ ...withoutPlan }, CANDIDATES)
    assert.equal(result.reply.intent, 'clarify')
    assert.equal(result.reply.plan, undefined)
  })
})

await test('grounding is bounded by the candidate set, not by the catalogue', async (t) => {
  await t.test('a real catalogue tool that was not a candidate is still dropped', () => {
    // The failure this rule exists for: a model recalling a tool it knows from
    // training and slipping it into a plan it was never offered. The tool
    // exists, so a catalogue check would pass it — and the recommendation would
    // no longer be traceable to anything the server decided.
    const result = groundReply(
      makeAssistantReply({
        plan: {
          title: 'Off-set',
          toolIds: ['beta-editor', 'delta-hidden'],
          agents: [],
          workflow: [{ stage: 'edit', toolId: 'beta-editor', why: 'a' }],
          prompts: 'p',
          comparison: 'c',
          steps: ['s'],
        },
      }),
      CANDIDATES,
    )

    assert.deepEqual(result.reply.plan?.toolIds, ['beta-editor'])
    assert.deepEqual(result.droppedToolIds, ['delta-hidden'])
  })

  await t.test('an empty candidate set drops everything and degrades', () => {
    const result = groundReply(makeAssistantReply(), [])
    assert.equal(result.degraded, true)
    assert.equal(result.reply.plan, undefined)
  })
})
