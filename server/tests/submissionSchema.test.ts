/*
 * The submission intake schema — SPEC-submit-backend.md §6.
 *
 * The `.strict()` case at the bottom is the one that matters most: §11 spells
 * out why — if a client could smuggle `"status":"approved"` past validation,
 * anyone could self-approve straight into the live catalogue. Everything
 * else here pins the human-facing message text, since the route (a later
 * slice) forwards these strings straight into the form's field errors.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { PRICING_MODELS, TOOL_CATEGORIES } from '../src/catalogue/taxonomy.ts'
import { SUBMISSIONS } from '../src/config/limits.ts'
import { SubmissionInputSchema } from '../src/submissions/schema.ts'
import { makeSubmissionPayload } from './helpers.ts'

function messagesFor(payload: unknown): string[] {
  const result = SubmissionInputSchema.safeParse(payload)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

function isValid(payload: unknown): boolean {
  return SubmissionInputSchema.safeParse(payload).success
}

/** No raw Zod jargon ("Invalid input", "expected string") ever reaches the form. */
function isHumanPhrased(message: string): boolean {
  return !/^(Invalid|Required|Expected)\b/i.test(message)
}

await test('SubmissionInputSchema', async (t) => {
  await t.test('a fully valid payload parses', () => {
    const result = SubmissionInputSchema.safeParse(makeSubmissionPayload())
    assert.equal(result.success, true)
  })

  await t.test('a valid payload with every optional field filled in also parses', () => {
    const result = SubmissionInputSchema.safeParse(
      makeSubmissionPayload({
        price: 'Free tier + paid plans',
        audience: 'Solo marketers',
        launchStory: 'Why this exists.',
        tags: ['ai', 'writing'],
        alternatives: ['Competitor A'],
        faqs: [{ question: 'Free trial?', answer: 'Yes, 14 days.' }],
      }),
    )
    assert.equal(result.success, true)
  })

  await t.test('every required field, missing, is rejected with its own human message', async (t) => {
    const expected: Record<string, string> = {
      siteUrl: 'Enter your website address.',
      name: 'Enter your tool’s name.',
      tagline: 'Enter a tagline.',
      description: 'Enter a description.',
      category: 'Choose a category from the list.',
      pricingModel: 'Choose a pricing model from the list.',
      tags: 'Tags must be a list.',
      alternatives: 'Alternatives must be a list.',
      faqs: 'Questions must be a list.',
      plan: 'Choose Free or Featured.',
      launchWeekId: 'Choose a launch week.',
    }

    for (const [field, message] of Object.entries(expected)) {
      await t.test(field, () => {
        const payload = makeSubmissionPayload()
        delete payload[field]
        assert.deepEqual(messagesFor(payload), [message])
      })
    }
  })

  await t.test('every message is phrased for a human, not a parser', async (t) => {
    // A broader sweep than the pinned messages above: nothing anywhere in
    // this schema should ever surface Zod's own vocabulary to the form.
    const probes: Record<string, unknown>[] = [
      { siteUrl: undefined },
      { name: undefined },
      { name: 123 },
      { category: 'NotACategory' },
      { pricingModel: 'NotAPricingModel' },
      { plan: 'sometimes' },
      { launchWeekId: 'not-a-date' },
      { tags: 'not-an-array' },
      { faqs: [{ question: '' }] },
    ]
    for (const overrides of probes) {
      await t.test(JSON.stringify(overrides), () => {
        const messages = messagesFor(makeSubmissionPayload(overrides))
        assert.ok(messages.length > 0, 'expected this probe to fail validation')
        assert.ok(messages.every(isHumanPhrased), `got jargon: ${JSON.stringify(messages)}`)
      })
    }
  })

  await t.test('each length cap, exceeded by exactly one, is rejected', async (t) => {
    const cases: Record<string, Record<string, unknown>> = {
      siteUrl: { siteUrl: `https://example.com/${'a'.repeat(SUBMISSIONS.maxSiteUrlChars)}` },
      name: { name: 'a'.repeat(SUBMISSIONS.maxNameChars + 1) },
      tagline: { tagline: 'a'.repeat(SUBMISSIONS.maxTaglineChars + 1) },
      description: { description: 'a'.repeat(SUBMISSIONS.maxDescriptionChars + 1) },
      price: { price: 'a'.repeat(SUBMISSIONS.maxPriceChars + 1) },
      audience: { audience: 'a'.repeat(SUBMISSIONS.maxAudienceChars + 1) },
      launchStory: { launchStory: 'a'.repeat(SUBMISSIONS.maxLaunchStoryChars + 1) },
      'tags (array length)': {
        tags: Array.from({ length: SUBMISSIONS.maxTags + 1 }, (_unused, i) => `tag-${i}`),
      },
      'tags (each item)': { tags: ['a'.repeat(SUBMISSIONS.maxTagChars + 1)] },
      'alternatives (array length)': {
        alternatives: Array.from(
          { length: SUBMISSIONS.maxAlternatives + 1 },
          (_unused, i) => `alt-${i}`,
        ),
      },
      'alternatives (each item)': {
        alternatives: ['a'.repeat(SUBMISSIONS.maxAlternativeChars + 1)],
      },
      'faqs (array length)': {
        faqs: Array.from({ length: SUBMISSIONS.maxFaqs + 1 }, () => ({
          question: 'A question',
          answer: 'An answer',
        })),
      },
      'faqs question (each item)': {
        faqs: [{ question: 'q'.repeat(SUBMISSIONS.maxFaqQuestionChars + 1), answer: 'An answer' }],
      },
      'faqs answer (each item)': {
        faqs: [{ question: 'A question', answer: 'a'.repeat(SUBMISSIONS.maxFaqAnswerChars + 1) }],
      },
    }

    for (const [label, overrides] of Object.entries(cases)) {
      await t.test(label, () => {
        assert.equal(isValid(makeSubmissionPayload(overrides)), false, `${label}: one over the cap must fail`)
      })
    }

    await t.test('sanity: exactly at the cap still passes', () => {
      assert.equal(isValid(makeSubmissionPayload({ name: 'a'.repeat(SUBMISSIONS.maxNameChars) })), true)
    })
  })

  await t.test('an unparseable URL is rejected', () => {
    assert.deepEqual(messagesFor(makeSubmissionPayload({ siteUrl: 'asdf' })), [
      'Enter a valid website address, like https://example.com.',
    ])
  })

  await t.test('a non-http(s) scheme is rejected', () => {
    assert.deepEqual(messagesFor(makeSubmissionPayload({ siteUrl: 'ftp://example.com/' })), [
      'Website address must start with http:// or https://.',
    ])
  })

  await t.test('a localhost URL is rejected', () => {
    assert.deepEqual(messagesFor(makeSubmissionPayload({ siteUrl: 'http://localhost/' })), [
      "That address isn't a public website.",
    ])
  })

  await t.test('loopback and private-range URLs are rejected, obfuscated or not', async (t) => {
    const blocked = [
      'http://127.0.0.1/',
      'http://127.1/', // shorthand — new URL() canonicalizes to 127.0.0.1
      'http://2130706433/', // decimal-encoded 127.0.0.1
      'http://0x7f.0.0.1/', // hex-encoded 127.0.0.1
      'http://0177.0.0.1/', // octal-encoded 127.0.0.1
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.1.1/',
      'http://169.254.1.1/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://[fc00::1]/',
    ]
    for (const url of blocked) {
      await t.test(url, () => {
        assert.equal(isValid(makeSubmissionPayload({ siteUrl: url })), false)
      })
    }
  })

  await t.test('a public address just outside the private ranges is accepted', async (t) => {
    // Guards against an off-by-one in the range checks rejecting real sites.
    const allowed = [
      'http://172.15.0.1/',
      'http://172.32.0.1/',
      'http://8.8.8.8/',
      'http://[::ffff:8.8.8.8]/', // IPv4-mapped, but the mapped address is public
    ]
    for (const url of allowed) {
      await t.test(url, () => {
        assert.equal(isValid(makeSubmissionPayload({ siteUrl: url })), true)
      })
    }
  })

  await t.test('an IPv4-mapped IPv6 literal is blocked when the mapped address is', async (t) => {
    // new URL() canonicalizes the dotted suffix into two hex groups — see
    // schema.ts's isBlockedIPv6 — so this exercises that decoding, not just
    // the surface syntax. Each one mirrors a blocked case already covered in
    // plain IPv4 form above.
    const blocked = [
      'http://[::ffff:127.0.0.1]/', // loopback
      'http://[::ffff:10.0.0.1]/', // 10.0.0.0/8
      'http://[::ffff:172.16.0.1]/', // 172.16.0.0/12
      'http://[::ffff:192.168.1.1]/', // 192.168.0.0/16
      'http://[::ffff:169.254.1.1]/', // link-local
      'http://[::ffff:0.0.0.0]/',
    ]
    for (const url of blocked) {
      await t.test(url, () => {
        assert.equal(isValid(makeSubmissionPayload({ siteUrl: url })), false)
      })
    }
  })

  await t.test('an invalid category is rejected', () => {
    assert.deepEqual(messagesFor(makeSubmissionPayload({ category: 'NotACategory' })), [
      'Choose a category from the list.',
    ])
  })

  await t.test('an invalid pricing model is rejected', () => {
    assert.deepEqual(messagesFor(makeSubmissionPayload({ pricingModel: 'NotAPricingModel' })), [
      'Choose a pricing model from the list.',
    ])
  })

  await t.test('membership is read from the live taxonomy, not a hardcoded copy', async (t) => {
    await t.test('every real category is accepted', () => {
      for (const category of TOOL_CATEGORIES) {
        assert.equal(isValid(makeSubmissionPayload({ category })), true, category)
      }
    })
    await t.test('every real pricing model is accepted', () => {
      for (const pricingModel of PRICING_MODELS) {
        assert.equal(isValid(makeSubmissionPayload({ pricingModel })), true, pricingModel)
      }
    })
  })

  await t.test('an invalid launchWeekId format is rejected', () => {
    assert.deepEqual(messagesFor(makeSubmissionPayload({ launchWeekId: '11/16/2026' })), [
      'Choose a valid launch week.',
    ])
  })

  await t.test('an invalid plan value is rejected', () => {
    assert.deepEqual(messagesFor(makeSubmissionPayload({ plan: 'premium' })), [
      'Choose Free or Featured.',
    ])
  })

  await t.test('"status":"approved" is rejected by .strict(), not silently dropped', () => {
    const payload = makeSubmissionPayload({ status: 'approved' })
    const result = SubmissionInputSchema.safeParse(payload)
    assert.equal(result.success, false, 'a client-supplied status must never validate')
    assert.ok(
      result.error!.issues.some((issue) => issue.code === 'unrecognized_keys'),
      'the rejection must come from .strict(), not from some other check',
    )
  })

  await t.test('any other unknown key is rejected the same way', () => {
    const result = SubmissionInputSchema.safeParse(
      makeSubmissionPayload({ id: 'attacker-chosen-id', createdAt: '2020-01-01' }),
    )
    assert.equal(result.success, false)
    assert.ok(result.error!.issues.some((issue) => issue.code === 'unrecognized_keys'))
  })
})
