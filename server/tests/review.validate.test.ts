/*
 * review/validate.ts and promptField's live validation — the fix for a
 * too-short summary only being caught at write time, after every other
 * field had already been filled in.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { TOOL_FIELDS } from '../src/config/limits.ts'
import { promptField } from '../src/review/cli.ts'
import type { Ask } from '../src/review/prompt.ts'
import { FIELD_RULES, validateMono, validatePopText, validatePrice, validateSlug, validateSummary, validateTag } from '../src/review/validate.ts'

function scriptedAsk(answers: string[]): { ask: Ask; prompts: string[] } {
  const prompts: string[] = []
  const queue = [...answers]
  const ask: Ask = async (prompt) => {
    prompts.push(prompt)
    return queue.shift() ?? ''
  }
  return { ask, prompts }
}

await test('validateSummary', async (t) => {
  await t.test('rejects a summary under the minimum', () => {
    const error = validateSummary('Too short.')
    assert.equal(typeof error, 'string')
    assert.match(error as string, new RegExp(String(TOOL_FIELDS.summaryMinChars)))
  })

  await t.test('rejects a summary over the maximum', () => {
    const error = validateSummary('a'.repeat(TOOL_FIELDS.summaryMaxChars + 1))
    assert.equal(typeof error, 'string')
    assert.match(error as string, new RegExp(String(TOOL_FIELDS.summaryMaxChars)))
  })

  await t.test('accepts exactly the minimum and exactly the maximum', () => {
    assert.equal(validateSummary('a'.repeat(TOOL_FIELDS.summaryMinChars)), undefined)
    assert.equal(validateSummary('a'.repeat(TOOL_FIELDS.summaryMaxChars)), undefined)
  })

  await t.test('rejects one character on either side of the boundary', () => {
    assert.notEqual(validateSummary('a'.repeat(TOOL_FIELDS.summaryMinChars - 1)), undefined)
    assert.notEqual(validateSummary('a'.repeat(TOOL_FIELDS.summaryMaxChars + 1)), undefined)
  })

  await t.test('the limits in the error message and FIELD_RULES both come from TOOL_FIELDS, not a hardcoded copy', () => {
    assert.match(FIELD_RULES.summary, new RegExp(String(TOOL_FIELDS.summaryMinChars)))
    assert.match(FIELD_RULES.summary, new RegExp(String(TOOL_FIELDS.summaryMaxChars)))
  })
})

await test('other field validators read their limits from TOOL_FIELDS', async (t) => {
  await t.test('validateMono', () => {
    assert.equal(validateMono('Cl'), undefined)
    assert.notEqual(validateMono('C'), undefined)
    assert.notEqual(validateMono('Claude'), undefined)
  })

  await t.test('validatePrice', () => {
    assert.equal(validatePrice('Free tier + paid plans'), undefined)
    assert.notEqual(validatePrice('a'.repeat(TOOL_FIELDS.priceMaxChars + 1)), undefined)
  })

  await t.test('validatePopText', () => {
    assert.equal(validatePopText('40'), undefined)
    assert.notEqual(validatePopText('101'), undefined)
    assert.notEqual(validatePopText('-1'), undefined)
    assert.notEqual(validatePopText('abc'), undefined)
    assert.notEqual(validatePopText('40.5'), undefined)
  })

  await t.test('validateTag', () => {
    assert.equal(validateTag('writing'), undefined)
    assert.notEqual(validateTag('a'.repeat(TOOL_FIELDS.tagMaxChars + 1)), undefined)
  })

  await t.test('validateSlug', () => {
    assert.equal(validateSlug('claude-code'), undefined)
    assert.notEqual(validateSlug('Claude Code'), undefined, 'spaces and capitals are not a valid slug')
    assert.notEqual(validateSlug('a'.repeat(TOOL_FIELDS.slugMaxChars + 1)), undefined)
  })
})

await test('promptField with a validator', async (t) => {
  await t.test('a too-short proposed summary is announced up front and not offered as a default', async () => {
    const { ask, prompts } = scriptedAsk(['A valid summary that comfortably clears the forty character floor.'])
    const result = await promptField(ask, 'summary', 'Too short.', validateSummary)

    assert.equal(result, 'A valid summary that comfortably clears the forty character floor.')
    // The prompt the reviewer actually saw must not show the invalid
    // proposal as an Enter-to-accept default.
    assert.ok(!prompts.some((p) => p.includes('Too short.')), 'the invalid proposal must not appear as a default')
  })

  await t.test('a valid proposal is still offered as a default (Enter accepts it)', async () => {
    const { ask, prompts } = scriptedAsk([''])
    const proposed = 'A perfectly fine proposed summary well past the forty character minimum length.'
    const result = await promptField(ask, 'summary', proposed, validateSummary)
    assert.equal(result, proposed)
    assert.ok(prompts.some((p) => p.includes(proposed)))
  })

  await t.test('a typed value that is also too short re-prompts rather than accepting it', async () => {
    const { ask } = scriptedAsk(['still too short', 'A valid summary that comfortably clears the forty character floor.'])
    const result = await promptField(ask, 'summary', 'Too short.', validateSummary)
    assert.equal(result, 'A valid summary that comfortably clears the forty character floor.')
  })

  await t.test('a typed value over the maximum re-prompts too', async () => {
    const tooLong = 'a'.repeat(TOOL_FIELDS.summaryMaxChars + 1)
    const valid = 'A valid summary that comfortably clears the forty character floor.'
    const { ask } = scriptedAsk([tooLong, valid])
    const result = await promptField(ask, 'summary', 'Fine to start.'.repeat(4), validateSummary)
    assert.equal(result, valid)
  })
})
