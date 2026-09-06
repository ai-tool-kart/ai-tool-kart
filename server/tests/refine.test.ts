/*
 * Deterministic conversation refinement.
 *
 * Phase F's load-bearing claim is that what the user says on turn two changes
 * what retrieval returns on turn two, and that none of it depends on the model
 * cooperating. Everything asserted here runs with no provider at all: the
 * refiner reads the user's words, looks the vocabulary up in
 * catalogue/taxonomy.ts, and resolves tool names through the repository port.
 *
 * The end-to-end consequences — narrower candidate sets, excluded tools, plans
 * that actually change — are in conversation.test.ts. This file pins down the
 * rules those depend on, one at a time, so a failure names the rule that broke.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assessBreadth,
  categoryFocusConstraint,
  FREE_ONLY_CONSTRAINT,
  mapToRole,
  parseConstraints,
  readPricingSignal,
  refineContext,
} from '../src/assistant/refine.ts'
import { emptyContext, normalizeContext } from '../src/assistant/context.ts'
import { ASSISTANT } from '../src/config/limits.ts'
import type { ConversationContext } from '../src/domain/types.ts'
import { fixtureCatalogue, makeTool, testLogger } from './helpers.ts'

/* ═══ Fixtures ═════════════════════════════════════════════════════════════ */

/**
 * A catalogue with names worth resolving against.
 *
 * "Make" earns its place: it is a real automation platform whose name is an
 * ordinary English verb, and it is the record that proves "I don't want to make
 * videos" does not reject it while "not Make" does.
 */
const catalogue = fixtureCatalogue([
  makeTool({
    id: 'descript',
    slug: 'descript',
    name: 'Descript',
    cat: 'Video',
    pricingTier: 'freemium',
    tags: ['Video editing'],
    roles: ['Video Editor'],
    useCases: ['Edit long videos'],
    stages: ['edit'],
    tagline: 'Edit video by editing the transcript.',
    summary: 'Descript edits video and audio by editing the transcript.',
  }),
  makeTool({
    id: 'opus-clip',
    slug: 'opus-clip',
    name: 'Opus Clip',
    cat: 'Video',
    pricingTier: 'freemium',
    tags: ['Shorts'],
    roles: ['Video Editor'],
    useCases: ['Create shorts'],
    stages: ['edit', 'publish'],
    tagline: 'Turns long recordings into short clips.',
    summary: 'Opus Clip cuts a long video into ranked short-form clips.',
  }),
  makeTool({
    id: 'runway',
    slug: 'runway',
    name: 'Runway',
    cat: 'Video',
    model: 'Subscription',
    pricingTier: 'paid',
    tags: ['Generative video'],
    roles: ['Video Editor'],
    useCases: ['Generate B-roll'],
    stages: ['ideate', 'edit'],
    tagline: 'Generative video and cleanup in one timeline.',
    summary: 'Runway generates video and cleans up footage on a timeline.',
  }),
  makeTool({
    id: 'cursor',
    slug: 'cursor',
    name: 'Cursor',
    cat: 'Code',
    model: 'Subscription',
    pricingTier: 'paid',
    tags: ['Editor'],
    roles: ['Developer'],
    useCases: ['Write code faster', 'Debug an issue'],
    stages: ['build'],
    tagline: 'An editor built around an AI pair programmer.',
    summary: 'Cursor is a code editor with an AI pair programmer built in.',
  }),
  makeTool({
    id: 'canva',
    slug: 'canva',
    name: 'Canva',
    cat: 'Design',
    pricingTier: 'freemium',
    tags: ['Layout'],
    roles: ['Graphic Designer'],
    useCases: ['Build wireframes'],
    stages: ['design'],
    tagline: 'Templates and layout for everyday design work.',
    summary: 'Canva does layout, templates and everyday graphic design.',
  }),
  makeTool({
    id: 'make',
    slug: 'make',
    name: 'Make',
    cat: 'Agents',
    pricingTier: 'freemium',
    tags: ['Automation'],
    roles: ['Entrepreneur'],
    useCases: ['Automate dev chores'],
    stages: ['automate'],
    tagline: 'Visual automation between the apps you already use.',
    summary: 'Make wires apps together with visual automation scenarios.',
  }),
])

const logger = testLogger()

function refine(message: string, previous: ConversationContext = emptyContext()) {
  return refineContext({ previous, message, catalogue, logger })
}

/* ═══ The canonical constraint vocabulary ══════════════════════════════════ */

await test('constraints are a closed vocabulary the server can read back', async (t) => {
  await t.test('the pricing constraint round-trips to a hard filter', () => {
    const parsed = parseConstraints([FREE_ONLY_CONSTRAINT])
    assert.deepEqual(parsed.pricingTiers, ['free', 'freemium'])
  })

  await t.test('a category focus round-trips to a ranking hint', () => {
    const parsed = parseConstraints([categoryFocusConstraint('Code')])
    assert.deepEqual(parsed.categories, ['Code'])
    assert.deepEqual(parsed.pricingTiers, [], 'a focus never filters')
  })

  await t.test('a string outside the vocabulary has no effect', () => {
    // This is why the model's own constraints are not adopted: prose it wrote
    // must never turn into a catalogue filter.
    const parsed = parseConstraints(['prefers tools that are cheap', 'focus on Sorcery'])
    assert.deepEqual(parsed.pricingTiers, [])
    assert.deepEqual(parsed.categories, [])
  })
})

/* ═══ Pricing ══════════════════════════════════════════════════════════════ */

await test('pricing language is read in both directions', async (t) => {
  const constrains = [
    'free tools only',
    'only free ones please',
    "I don't want paid tools",
    'I have no budget',
    'freemium is okay',
    'something with a free tier',
  ]
  for (const message of constrains) {
    await t.test(`"${message}" constrains`, () => {
      assert.equal(readPricingSignal(message), 'constrain')
    })
  }

  const releases = ['paid is fine', "budget doesn't matter", 'happy to pay for the right tool']
  for (const message of releases) {
    await t.test(`"${message}" releases`, () => {
      assert.equal(readPricingSignal(message), 'release')
    })
  }

  await t.test('an ordinary request says nothing about budget', () => {
    assert.equal(readPricingSignal('I want to edit videos faster'), 'none')
  })
})

await test('the pricing constraint carries and clears', async (t) => {
  await t.test('stating it records the canonical constraint and the filter', async () => {
    const { context, retrieval } = await refine('free tools only, for editing video')
    assert.deepEqual(context.constraints, [FREE_ONLY_CONSTRAINT])
    assert.deepEqual(retrieval.pricingTiers, ['free', 'freemium'])
  })

  await t.test('it survives a later turn that says nothing about money', async () => {
    const first = await refine('free tools only, for editing video')
    const second = await refine('what about captions?', first.context)
    assert.deepEqual(second.context.constraints, [FREE_ONLY_CONSTRAINT])
    assert.deepEqual(second.retrieval.pricingTiers, ['free', 'freemium'])
  })

  await t.test('a release clears it, so a user can talk their way back out', async () => {
    const first = await refine('free tools only, for editing video')
    const second = await refine('actually paid is fine', first.context)
    assert.deepEqual(second.context.constraints, [])
    assert.deepEqual(second.retrieval.pricingTiers, [])
  })

  await t.test('release wins over constrain inside one message', async () => {
    const { retrieval } = await refine('a free tier is nice but paid is fine')
    assert.deepEqual(retrieval.pricingTiers, [])
  })
})

/* ═══ Rejections ═══════════════════════════════════════════════════════════ */

await test('a rejected tool becomes a hard exclusion', async (t) => {
  await t.test('"not Descript" resolves Descript', async () => {
    const { context, retrieval } = await refine('Not Descript.')
    assert.deepEqual(context.rejectedToolIds, ['descript'])
    assert.deepEqual(retrieval.rejectedToolIds, ['descript'])
  })

  const phrasings = [
    "don't recommend Canva",
    'I do not want Cursor',
    'anything but Runway',
    'avoid Opus Clip',
    "don't want to use Descript",
  ]
  for (const message of phrasings) {
    await t.test(`"${message}" resolves`, async () => {
      const { context } = await refine(message)
      assert.equal(context.rejectedToolIds.length, 1, message)
    })
  }

  await t.test('a multi-word name resolves whole', async () => {
    const { context } = await refine('not Opus Clip')
    assert.deepEqual(context.rejectedToolIds, ['opus-clip'])
  })

  await t.test('earlier rejections are preserved', async () => {
    const first = await refine('not Descript')
    const second = await refine('and not Canva either', first.context)
    assert.deepEqual(second.context.rejectedToolIds, ['descript', 'canva'])
  })

  await t.test('repeating a rejection does not duplicate it', async () => {
    const first = await refine('not Descript')
    const second = await refine('really, not Descript', first.context)
    assert.deepEqual(second.context.rejectedToolIds, ['descript'])
  })

  await t.test('rejecting a tool that does not exist creates no id', async () => {
    // An invented id in the conversation state would be a fabricated identifier
    // travelling in a field that is otherwise always a real catalogue key.
    const { context } = await refine('not SuperFakeAI, and not Wizardly at fake.example')
    assert.deepEqual(context.rejectedToolIds, [])
  })

  await t.test('a name is only read where a name could be', async () => {
    // "Make" is a real record here. The sentence is about making videos.
    const { context } = await refine("I don't want to make videos, just edit them")
    assert.deepEqual(context.rejectedToolIds, [])
  })

  await t.test('"not Make" does reject Make', async () => {
    const { context } = await refine('not Make')
    assert.deepEqual(context.rejectedToolIds, ['make'])
  })

  await t.test('the rejected name never travels into the goal', async () => {
    // It would be the strongest term in the next turn's query — the assistant
    // would ask hardest for the tool the user had just ruled out.
    const { context } = await refine('editing video, but not Descript')
    assert.doesNotMatch(context.goal ?? '', /descript/i)
  })
})

/* ═══ Confirmations ════════════════════════════════════════════════════════ */

await test('a confirmed tool is a preference, not a promotion', async (t) => {
  await t.test('"I already use Cursor" resolves', async () => {
    const { context, retrieval } = await refine('I already use Cursor for React work')
    assert.deepEqual(context.confirmedToolIds, ['cursor'])
    assert.deepEqual(retrieval.confirmedToolIds, ['cursor'])
  })

  for (const message of ['keep Canva in the setup', 'Descript works for me', 'we use Make']) {
    await t.test(`"${message}" resolves`, async () => {
      const { context } = await refine(message)
      assert.equal(context.confirmedToolIds.length, 1, message)
    })
  }

  await t.test('the preference survives later turns', async () => {
    const first = await refine('I already use Cursor')
    const second = await refine('what about design?', first.context)
    assert.deepEqual(second.context.confirmedToolIds, ['cursor'])
  })

  await t.test('rejection wins when the user changes their mind', async () => {
    const first = await refine('I already use Descript')
    const second = await refine('actually, not Descript', first.context)
    assert.deepEqual(second.context.rejectedToolIds, ['descript'])
    assert.deepEqual(second.context.confirmedToolIds, [])
  })

  await t.test('re-accepting a rejected tool reverses it', async () => {
    const first = await refine('not Descript')
    const second = await refine('actually I already use Descript', first.context)
    assert.deepEqual(second.context.confirmedToolIds, ['descript'])
    assert.deepEqual(second.context.rejectedToolIds, [])
  })

  await t.test('a tool is never in both lists at once', async () => {
    const { context } = await refine('I already use Descript but not Descript')
    const overlap = context.confirmedToolIds.filter((id) =>
      context.rejectedToolIds.includes(id),
    )
    assert.deepEqual(overlap, [])
  })
})

/* ═══ Role ═════════════════════════════════════════════════════════════════ */

await test('role refinement', async (t) => {
  await t.test('a stated role is mapped onto the taxonomy', async () => {
    for (const [message, expected] of [
      ["I'm a developer", 'Developer'],
      ['I am a UI designer', 'UI/UX Designer'],
      ['as a video editor, I need help', 'Video Editor'],
      ['I am a marketer', 'Marketer'],
    ] as const) {
      const { context } = await refine(message)
      assert.equal(context.role, expected, message)
    }
  })

  await t.test('a role implied by the subject fills a gap', async () => {
    // "I build React websites" names no role ROLE_KEYWORDS knows, and names Code
    // unambiguously. Developer is who asks for Code tools.
    const { context } = await refine('I build React websites')
    assert.equal(context.role, 'Developer')
  })

  for (const [message, expected] of [
    ['I edit YouTube videos', 'Video Editor'],
    ["I'm doing research on climate policy", 'Researcher'],
  ] as const) {
    await t.test(`"${message}" implies ${expected}`, async () => {
      const { context } = await refine(message)
      assert.equal(context.role, expected)
    })
  }

  await t.test('a job the taxonomy has no role for stays unset', async () => {
    // Better than a wrong role: a role is a scoring signal, and a wrong one
    // quietly narrows every later turn.
    const { context } = await refine('I run a restaurant')
    assert.equal(context.role, undefined)
  })

  await t.test('a known role is not replaced by a vaguer turn', async () => {
    const first = await refine('I am a video editor')
    const second = await refine('free tools only', first.context)
    assert.equal(second.context.role, 'Video Editor')
  })

  await t.test('the user can correct their role', async () => {
    const first = await refine('I am a video editor')
    const second = await refine('actually I am a marketer', first.context)
    assert.equal(second.context.role, 'Marketer')
  })

  await t.test('an implied role never displaces a stated one', async () => {
    const first = await refine('I am a marketer')
    const second = await refine('I need to edit some video', first.context)
    assert.equal(second.context.role, 'Marketer')
  })
})

await test('mapToRole maps free text or nothing at all', async (t) => {
  await t.test('an exact taxonomy role passes through', () => {
    assert.equal(mapToRole('UI/UX Designer'), 'UI/UX Designer')
  })

  await t.test('a synonym is mapped', () => {
    assert.equal(mapToRole('a videographer'), 'Video Editor')
    assert.equal(mapToRole('software engineer'), 'Developer')
  })

  await t.test('an unmappable role is undefined, not invented', () => {
    assert.equal(mapToRole('restaurant owner'), undefined)
    assert.equal(mapToRole(''), undefined)
    assert.equal(mapToRole(undefined), undefined)
  })
})

/* ═══ Goal ═════════════════════════════════════════════════════════════════ */

await test('goal refinement', async (t) => {
  await t.test('the first turn establishes the subject', async () => {
    const { context } = await refine('I need AI tools for video editing')
    assert.match(context.goal ?? '', /video/)
    assert.match(context.goal ?? '', /edit/)
  })

  await t.test('a later turn narrows without losing the subject', async () => {
    const first = await refine('I need coding tools')
    const second = await refine('mostly for debugging React apps', first.context)
    assert.match(second.context.goal ?? '', /code/, 'the earlier subject survives')
    assert.match(second.context.goal ?? '', /debug/, 'the new specifics are added')
    assert.match(second.context.goal ?? '', /react/)
  })

  await t.test('the accumulated goal is what carries the topic into retrieval', async () => {
    const first = await refine('I need AI tools for video editing')
    const second = await refine('free or freemium only, and not Descript', first.context)
    // The message alone says nothing about video. The query does.
    assert.match(second.retrieval.query, /video/)
    assert.match(second.retrieval.query, /edit/)
  })

  await t.test('a change of subject replaces rather than accumulates', async () => {
    const first = await refine('I need AI tools for video editing')
    const second = await refine('actually I need coding tools now', first.context)
    assert.match(second.context.goal ?? '', /code/)
    assert.doesNotMatch(second.context.goal ?? '', /video/)
  })

  await t.test('pricing language never becomes part of the goal', async () => {
    const { context } = await refine('free tools only for editing video')
    assert.doesNotMatch(context.goal ?? '', /free/)
  })

  await t.test('the goal is bounded', async () => {
    let context = emptyContext()
    for (const message of [
      'video editing shorts captions',
      'audio voice podcast transcription',
      'design layout wireframe branding',
      'code debug refactor api',
    ]) {
      context = (await refine(message, context)).context
    }
    assert.ok((context.goal ?? '').split(', ').length <= ASSISTANT.maxGoalTerms)
    assert.ok((context.goal ?? '').length <= ASSISTANT.maxGoalChars)
  })
})

/* ═══ Breadth ══════════════════════════════════════════════════════════════ */

await test('breadth decides whether to ask or to answer', async (t) => {
  await t.test('one recognised term is a subject, not a request', () => {
    assert.equal(assessBreadth({ recognised: ['code'], useCases: [] }), 'broad')
    assert.equal(assessBreadth({ recognised: [], useCases: [] }), 'broad')
  })

  await t.test('two are a subject and something to do with it', () => {
    assert.equal(assessBreadth({ recognised: ['video', 'edit'], useCases: [] }), 'specific')
  })

  await t.test('a named goal is enough on its own', () => {
    assert.equal(assessBreadth({ recognised: ['code'], useCases: ['Debug an issue'] }), 'specific')
  })

  for (const message of ['I need AI tools', 'tools for coding', 'help with marketing']) {
    await t.test(`"${message}" is broad`, async () => {
      assert.equal((await refine(message)).breadth, 'broad')
    })
  }

  for (const message of [
    'I need AI tools for video editing',
    "I'm building React websites, mostly debugging and UI",
    'I am a video editor and I want to speed up my YouTube editing workflow',
  ]) {
    await t.test(`"${message}" is specific`, async () => {
      assert.equal((await refine(message)).breadth, 'specific')
    })
  }

  await t.test('a refinement is judged on the conversation, not the message', async () => {
    // "Free or freemium only, and not Descript" names nothing on its own.
    const first = await refine('I need AI tools for video editing')
    const second = await refine('free or freemium only, and not Descript', first.context)
    assert.equal(second.breadth, 'specific')
  })

  await t.test('a broad follow-up to a broad turn asks again', async () => {
    const first = await refine('I need AI tools')
    const second = await refine('for coding', first.context)
    assert.equal(second.breadth, 'broad')
  })
})

/* ═══ Focus ════════════════════════════════════════════════════════════════ */

await test('a stated focus is recorded and ranks, never filters', async (t) => {
  await t.test('an explicit focus phrase records the categories', async () => {
    const { context, retrieval } = await refine('mostly debugging and UI')
    assert.ok(context.constraints.includes(categoryFocusConstraint('Code')))
    assert.ok(retrieval.categories.includes('Code'))
    assert.deepEqual(retrieval.pricingTiers, [], 'a focus is not a filter')
  })

  await t.test('a subject mentioned without a focus phrase records nothing', async () => {
    const { context } = await refine('I need help with debugging')
    assert.deepEqual(context.constraints, [])
  })

  await t.test('focuses are bounded and carried', async () => {
    const first = await refine('mostly debugging and UI')
    const second = await refine('free tools only', first.context)
    assert.ok(second.context.constraints.includes(FREE_ONLY_CONSTRAINT))
    assert.ok(second.context.constraints.length <= ASSISTANT.maxConstraints)
  })
})

/* ═══ Sanitisation ═════════════════════════════════════════════════════════ */

await test('an incoming context is bounded before it is believed', async (t) => {
  await t.test('a forged id in the context is carried but resolves to nothing', async () => {
    // Grounding is what stops it appearing; this is the layer before it. A fake
    // id may sit in the exclusion list — excluding a tool that does not exist is
    // a no-op — but it can never become a recommendation.
    const previous = normalizeContext({ confirmedToolIds: ['superfakeai'], turn: 1 })
    const { retrieval } = await refine('video editing', previous)
    assert.deepEqual(retrieval.confirmedToolIds, ['superfakeai'])
    assert.equal(retrieval.query.includes('superfakeai'), false)
  })

  await t.test('id lists are deduplicated and capped', () => {
    const context = normalizeContext({
      rejectedToolIds: Array.from({ length: 100 }, (_, i) => `t-${i % 5}`),
    })
    assert.deepEqual(context.rejectedToolIds, ['t-0', 't-1', 't-2', 't-3', 't-4'])
  })

  await t.test('the turn counter is not advanced by refinement', async () => {
    // Only a completed turn advances it, so a request that fails later cannot
    // leave the conversation a turn further on than it really is.
    const { context } = await refine('video editing', normalizeContext({ turn: 3 }))
    assert.equal(context.turn, 3)
  })
})
