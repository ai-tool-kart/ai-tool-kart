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
import { GROUNDING_FALLBACK_MESSAGE, groundReply } from '../src/assistant/ground.ts'
import { AssistantReplySchema } from '../src/assistant/schema.ts'
import { makeAssistantReply } from './helpers.ts'

const CANDIDATES = ['alpha-writer', 'beta-editor', 'gamma-coder']

await test('a forged tool id never survives grounding', async (t) => {
  await t.test('a forged id is dropped and counted, the real one survives', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          steps: [
            { stage: 'edit', toolId: 'beta-editor', alsoGoodToolIds: [] },
            { stage: 'publish', toolId: 'superfakeai', alsoGoodToolIds: [] },
          ],
        },
      }),
      CANDIDATES,
    )

    assert.deepEqual(
      result.reply.plan?.steps.map((step) => step.toolId),
      ['beta-editor'],
    )
    assert.deepEqual(result.droppedToolIds, ['superfakeai'])
    assert.equal(result.degraded, false)
  })

  await t.test('valid ids are kept while forged ones are counted', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          steps: [
            { stage: 'draft', toolId: 'alpha-writer', alsoGoodToolIds: [] },
            { stage: 'edit', toolId: 'ghost-two', alsoGoodToolIds: [] },
            { stage: 'build', toolId: 'beta-editor', alsoGoodToolIds: [] },
          ],
        },
      }),
      CANDIDATES,
    )

    assert.deepEqual(
      result.reply.plan?.steps.map((step) => step.toolId),
      ['alpha-writer', 'beta-editor'],
    )
    assert.deepEqual(result.droppedToolIds, ['ghost-two'])
  })

  await t.test('a repeated forged id is counted once', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          steps: [
            { stage: 'edit', toolId: 'ghost', alsoGoodToolIds: [] },
            { stage: 'build', toolId: 'ghost', alsoGoodToolIds: [] },
            { stage: 'draft', toolId: 'beta-editor', alsoGoodToolIds: [] },
          ],
        },
      }),
      CANDIDATES,
    )

    // A model repeating an invented id is one mistake, not two.
    assert.deepEqual(result.droppedToolIds, ['ghost'])
  })

  await t.test('the model ordering of steps is preserved, never re-sorted', () => {
    const result = groundReply(
      makeAssistantReply({
        plan: {
          steps: [
            { stage: 'build', toolId: 'gamma-coder', alsoGoodToolIds: [] },
            { stage: 'draft', toolId: 'alpha-writer', alsoGoodToolIds: [] },
            { stage: 'edit', toolId: 'beta-editor', alsoGoodToolIds: [] },
          ],
        },
      }),
      CANDIDATES,
    )

    // Arrangement is what the model was asked for. Re-sorting would discard it.
    assert.deepEqual(
      result.reply.plan?.steps.map((step) => step.toolId),
      ['gamma-coder', 'alpha-writer', 'beta-editor'],
    )
  })
})

await test('a plan grounding cannot save degrades to a clarification', async (t) => {
  const forged = makeAssistantReply({
    message: 'Here are four excellent tools for that.',
    plan: {
      steps: [
        { stage: 'edit', toolId: 'ghost-one', alsoGoodToolIds: [] },
        { stage: 'build', toolId: 'ghost-two', alsoGoodToolIds: [] },
      ],
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
    // It was written to introduce tools that are no longer there.
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
          plan: { steps: [{ stage: 'edit', toolId: 'ghost-two', alsoGoodToolIds: [] }] },
        }),
        CANDIDATES,
      )
      assert.equal(result.reply.plan, undefined)
      assert.deepEqual(result.droppedToolIds, ['ghost-two'])
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
          steps: [
            { stage: 'edit', toolId: 'beta-editor', alsoGoodToolIds: [] },
            { stage: 'build', toolId: 'delta-hidden', alsoGoodToolIds: [] },
          ],
        },
      }),
      CANDIDATES,
    )

    assert.deepEqual(
      result.reply.plan?.steps.map((step) => step.toolId),
      ['beta-editor'],
    )
    assert.deepEqual(result.droppedToolIds, ['delta-hidden'])
  })

  await t.test('an empty candidate set drops everything and degrades', () => {
    const result = groundReply(makeAssistantReply(), [])
    assert.equal(result.degraded, true)
    assert.equal(result.reply.plan, undefined)
  })
})
