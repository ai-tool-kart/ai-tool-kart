/*
 * The automations importer's pure mapping rules — SPEC-automations.md §8.
 *
 * No spreadsheet is read here. The five header shapes are the survey's own,
 * verbatim (docs/BATCH-SURVEY.md §2), and every row built from them is run
 * through the real AutomationSchema, so a mapping that drifts from the schema
 * fails here rather than at import time.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignSlugs,
  automationId,
  buildTools,
  createCatalogueMatcher,
  dedupeRows,
  derivePricingTier,
  mapHeader,
  normalizeHeader,
  parseBeginnerFriendly,
  parseTrustScore,
  rowToDraft,
  splitIntentLabels,
  splitToolNames,
  type SheetField,
  type SheetRow,
} from '../scripts/importAutomations.ts'
import { AutomationSchema } from '../src/automations/schema.ts'
import { makeTool } from './helpers.ts'

/* ═══ Fixtures ═════════════════════════════════════════════════════════════ */

const SHAPE_A = [
  'Niche / Industry', 'Audience / Persona', 'Task Title (natural-language query)',
  'Intent Labels / Synonyms', 'Recommended Tools', 'Workflow Summary', 'Sample Prompt',
  'Beginner-Friendly?', 'Quality / Trust Score (1-5)', 'Pricing / Free Plan', 'Source URL',
  'Source Type', 'Freshness (evidence date)', 'Access / Rights Notes',
]
const SHAPE_B = SHAPE_A.map((h) =>
  h === 'Task Title (natural-language query)' ? 'Task Title'
    : h === 'Quality / Trust Score (1-5)' ? 'Quality / Trust Score' : h,
)
const SHAPE_C = SHAPE_B.map((h) => (h === 'Freshness (evidence date)' ? 'Freshness' : h))
const SHAPE_D = [
  'ID', ...SHAPE_A.map((h) => (h === 'Workflow Summary' ? 'Workflow Summary (plain language)' : h)),
]
const SHAPE_E = SHAPE_A.map((h) =>
  h === 'Task Title (natural-language query)' ? 'Task Title'
    : h === 'Freshness (evidence date)' ? 'Freshness (Evidence Date)' : h,
)
const SHAPES = { A: SHAPE_A, B: SHAPE_B, C: SHAPE_C, D: SHAPE_D, E: SHAPE_E }

/** The cell each field holds in a well-formed Students row. */
const CELLS: Record<SheetField, string> = {
  sector: 'Students',
  persona: 'College students juggling classes, clubs, and a part-time job',
  title: 'make a study schedule that actually fits around my classes and deadlines',
  intentLabels: 'AI calendar planner; auto-schedule my study time; time blocking app',
  tools: 'Motion; Notion AI; Some Unlisted Planner',
  workflowSummary: 'Connect your class schedule and deadlines; Motion slots study blocks in.',
  samplePrompt: 'Plan my week around three exams and a part-time job.',
  beginnerFriendly: 'Yes - guided setup, no jargon',
  trustScore: '4',
  pricingNote: 'Free trial, then paid plans from $19/mo',
  sourceUrl: 'https://www.usemotion.com',
  sourceType: 'Vendor site',
  freshness: 'Retrieved Sep 2026',
  accessNotes: '7-day trial requires a card upfront',
}

/** A spreadsheet row for `header`, the way readFileRows builds one. */
function rowFor(header: readonly string[], overrides: Partial<Record<SheetField, string>> = {}): SheetRow {
  const cells: Record<SheetField, string> = { ...CELLS, ...overrides }
  const grid = header.map((h) => {
    const field = [...mapHeader([h]).columns.keys()][0]
    return field ? cells[field] : '17'
  })
  const row: SheetRow = {}
  for (const [field, column] of mapHeader(header).columns) row[field] = grid[column]
  return row
}

const CATALOGUE = [
  makeTool({ id: 'notion-ai', slug: 'notion-ai', name: 'Notion AI', url: 'https://www.notion.so/product/ai' }),
  makeTool({ id: 'chatgpt', slug: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com' }),
]
const matcher = createCatalogueMatcher(CATALOGUE)
const SOURCE = { niche: 'Students', batch: 'Students AI Workflows Batch2' }

/** A mapped row made into a full record, as main() does. */
function recordFrom(row: SheetRow, slug = 'a-slug') {
  const mapped = rowToDraft(row, SOURCE, matcher)
  const record: Record<string, unknown> = {
    id: automationId('Students', row.title ?? ''),
    slug,
    ...mapped.draft,
  }
  return { mapped, record }
}

/* ═══ Headers ══════════════════════════════════════════════════════════════ */

await test('header normalization', async (t) => {
  await t.test('drops parentheticals, punctuation, case and extra spaces', () => {
    assert.equal(normalizeHeader('Task Title (natural-language query)'), 'task title')
    assert.equal(normalizeHeader('Quality / Trust Score (1-5)'), 'quality trust score')
    assert.equal(normalizeHeader('Beginner-Friendly?'), 'beginner friendly')
    assert.equal(normalizeHeader('  Freshness (Evidence Date) '), 'freshness')
    assert.equal(normalizeHeader('Workflow Summary (plain language)'), 'workflow summary')
  })

  for (const [name, header] of Object.entries(SHAPES)) {
    await t.test(`shape ${name} maps every field, with nothing unmapped or missing`, () => {
      const mapping = mapHeader(header)
      assert.deepEqual(mapping.unmapped, [])
      assert.deepEqual(mapping.missing, [])
      assert.deepEqual(mapping.duplicated, [])
      assert.equal(mapping.columns.size, 14)
    })
  }

  await t.test('the five shapes collapse into one mapping', () => {
    const fieldsOf = (header: string[]) => [...mapHeader(header).columns.keys()].sort()
    const reference = fieldsOf(SHAPE_A)
    for (const header of Object.values(SHAPES)) assert.deepEqual(fieldsOf(header), reference)
  })

  await t.test('an unknown header is reported, not guessed', () => {
    const mapping = mapHeader([...SHAPE_A, 'Estimated Hours Saved'])
    assert.deepEqual(mapping.unmapped, ['Estimated Hours Saved'])
  })

  await t.test('a missing required column is reported; optional ones are not', () => {
    const mapping = mapHeader(SHAPE_A.filter((h) => h !== 'Sample Prompt' && h !== 'Access / Rights Notes'))
    assert.deepEqual(mapping.missing, ['samplePrompt'])
  })

  await t.test('ID is known and ignored, not unmapped', () => {
    assert.deepEqual(mapHeader(SHAPE_D).unmapped, [])
  })
})

/* ═══ Row → record ═════════════════════════════════════════════════════════ */

await test('row-to-record mapping', async (t) => {
  for (const [name, header] of Object.entries(SHAPES)) {
    await t.test(`a shape ${name} row maps to a valid record`, () => {
      const { mapped, record } = recordFrom(rowFor(header))
      assert.deepEqual(mapped.errors, [])
      const parsed = AutomationSchema.safeParse(record)
      assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues))
    })
  }

  await t.test('the fields come out as the importer rules say', () => {
    const { record } = recordFrom(rowFor(SHAPE_D))
    assert.equal(record.niche, 'Students', 'niche is the folder, passed in')
    assert.equal(record.sector, 'Students', 'sector is the Niche/Industry cell')
    assert.equal(record.kind, 'workflow')
    assert.equal(record.beginnerFriendly, 'yes')
    assert.equal(record.beginnerNote, 'guided setup, no jargon')
    assert.equal(record.trustScore, 4)
    assert.equal(record.pricingNote, CELLS.pricingNote, 'the full cell, never rewritten')
    assert.deepEqual(record.intentLabels, [
      'AI calendar planner',
      'auto-schedule my study time',
      'time blocking app',
    ])
    assert.equal(record.status, 'active')
    assert.equal('steps' in record, false, 'steps is omitted, not an empty array')
    assert.notEqual(record.id, '17', "the sheet's ID column is not the record id")
  })

  await t.test('sector differing from the folder is kept as-is', () => {
    const { record } = recordFrom(rowFor(SHAPE_A, { sector: 'Small Business Owners (generic)' }))
    assert.equal(record.niche, 'Students')
    assert.equal(record.sector, 'Small Business Owners (generic)')
  })

  await t.test('empty optional cells are omitted, not sent as empty strings', () => {
    const { record } = recordFrom(rowFor(SHAPE_A, { sector: '', accessNotes: '', beginnerFriendly: 'Yes' }))
    assert.equal('sector' in record, false)
    assert.equal('accessNotes' in record, false)
    assert.equal('beginnerNote' in record, false)
    assert.equal(AutomationSchema.safeParse(record).success, true)
  })

  await t.test('an unparseable Beginner-Friendly or trust cell is reported by field', () => {
    const { mapped } = recordFrom(rowFor(SHAPE_A, { beginnerFriendly: 'Maybe - depends', trustScore: 'high' }))
    assert.equal(mapped.errors.length, 2)
    assert.match(mapped.errors[0] ?? '', /^beginnerFriendly:/)
    assert.match(mapped.errors[1] ?? '', /^trustScore:/)
  })
})

/* ═══ Intent labels ════════════════════════════════════════════════════════ */

await test('intent labels: ";" first, "," as the fallback', async (t) => {
  await t.test('a semicolon cell splits on ";"', () => {
    assert.deepEqual(splitIntentLabels('summarize PDF; chat with my notes ; study guide'), [
      'summarize PDF',
      'chat with my notes',
      'study guide',
    ])
  })

  await t.test('a cell with no ";" splits on ","', () => {
    assert.deepEqual(splitIntentLabels('venue search, venue sourcing, find event space'), [
      'venue search',
      'venue sourcing',
      'find event space',
    ])
  })

  await t.test('with a ";" present, commas stay inside a label', () => {
    assert.deepEqual(
      splitIntentLabels('hotel loyalty program software; multi-outlet loyalty (rooms, F&B, spa)'),
      ['hotel loyalty program software', 'multi-outlet loyalty (rooms, F&B, spa)'],
    )
  })

  await t.test('empties are dropped', () => {
    assert.deepEqual(splitIntentLabels('a;; b ;'), ['a', 'b'])
    assert.deepEqual(splitIntentLabels(''), [])
  })
})

/* ═══ Beginner-Friendly ════════════════════════════════════════════════════ */

await test('beginnerFriendly parsing', async (t) => {
  // Every leading form in docs/BATCH-SURVEY.md §5, with the value and note it
  // must produce. A bare form is tested both alone and followed by text.
  const FORMS: Array<[string, 'yes' | 'somewhat' | 'no', string | undefined]> = [
    ['Yes - guided setup', 'yes', 'guided setup'],
    ['Somewhat - needs an account', 'somewhat', 'needs an account'],
    ['Yes — works in the browser', 'yes', 'works in the browser'],
    ['yes - plain English', 'yes', 'plain English'],
    ['Somewhat — some setup', 'somewhat', 'some setup'],
    ['Yes', 'yes', undefined],
    ['somewhat - learning curve', 'somewhat', 'learning curve'],
    ['yes', 'yes', undefined],
    ['yes — one click', 'yes', 'one click'],
    ['somewhat — templates help', 'somewhat', 'templates help'],
    ['somewhat (needs a CRM connected)', 'somewhat', 'needs a CRM connected'],
    ['No — built for developers', 'no', 'built for developers'],
    ['somewhat', 'somewhat', undefined],
    ['No - requires API keys', 'no', 'requires API keys'],
    ['no — enterprise onboarding', 'no', 'enterprise onboarding'],
    ['no - command line', 'no', 'command line'],
    ['Somewhat', 'somewhat', undefined],
  ]

  await t.test('covers all 17 surveyed forms', () => {
    assert.equal(FORMS.length, 17)
  })

  for (const [cell, value, note] of FORMS) {
    await t.test(JSON.stringify(cell), () => {
      const parsed = parseBeginnerFriendly(cell)
      assert.equal(parsed.ok, true)
      if (!parsed.ok) return
      assert.equal(parsed.value, value)
      assert.equal(parsed.note, note)
    })
  }

  await t.test('a bare word followed by text keeps the text as the note', () => {
    const parsed = parseBeginnerFriendly('Yes guided profile setup')
    assert.deepEqual(parsed, { ok: true, value: 'yes', note: 'guided profile setup' })
  })

  await t.test('an unrecognised leading word fails the row', () => {
    for (const cell of ['Maybe - depends', 'Nope', 'Not really', 'Yesish', '', '- yes']) {
      assert.equal(parseBeginnerFriendly(cell).ok, false, cell)
    }
  })
})

/* ═══ Trust score ══════════════════════════════════════════════════════════ */

await test('trustScore takes the leading digit', async (t) => {
  await t.test('a bare digit', () => assert.equal(parseTrustScore('3'), 3))
  await t.test('"N/5 - prose"', () => {
    assert.equal(parseTrustScore('2/5 - single-vendor marketing page; verify'), 2)
  })
  await t.test('nothing usable is undefined', () => {
    for (const cell of ['', 'high', '0', '7', '10']) assert.equal(parseTrustScore(cell), undefined, cell)
  })
})

/* ═══ Pricing ══════════════════════════════════════════════════════════════ */

await test('pricingTier rules, in order', async (t) => {
  const cases: Array<[string, string, string]> = [
    ['Free trial, then $19/mo', 'paid', 'trial-only'],
    ['14-day free trial; no card required', 'paid', 'trial-only'],
    ['Free plan available; Pro from $10/mo', 'freemium', 'free-plan'],
    ['Free tier with limits', 'freemium', 'free-plan'],
    ['Free version for students', 'freemium', 'free-plan'],
    ['Free forever for one user', 'freemium', 'free-plan'],
    ['Free account; upgrades available', 'freemium', 'free-plan'],
    ['Free to start, $12 per seat after', 'freemium', 'free-and-paid'],
    ['Basic is free; paid plans add scheduling', 'freemium', 'free-and-paid'],
    ['Completely free for educators', 'free', 'free-only'],
    ['Custom pricing — contact sales', 'paid', 'paid-signal'],
    ['Pricing not published', 'paid', 'paid-signal'],
    ['From $49/month', 'paid', 'paid-signal'],
    ['Free Basic plan for one location; paid tiers add payroll', 'freemium', 'free-named-plan'],
    ['Free Starter plan', 'freemium', 'free-named-plan'],
    ['Free for 3 users, paid tiers beyond', 'freemium', 'free-and-paid-tier'],
    ['Free core app; paid subscription unlocks sync', 'freemium', 'free-and-paid-tier'],
    ['Free with ads, paid version removes them', 'freemium', 'free-and-paid-tier'],
    ['Paid subscription only', 'paid', 'default'],
    ['Included with Microsoft 365', 'paid', 'default'],
    ['', 'paid', 'default'],
  ]
  for (const [note, tier, rule] of cases) {
    await t.test(`${JSON.stringify(note)} → ${tier} (${rule})`, () => {
      assert.deepEqual(derivePricingTier(note), { tier, rule })
    })
  }

  await t.test('a free trial beside another "free" is not trial-only', () => {
    assert.equal(derivePricingTier('Free plan; 7-day free trial of Pro').tier, 'freemium')
  })

  await t.test('"free" beside "paid tiers" is never plain free', () => {
    assert.notEqual(derivePricingTier('Free for 3 users, paid tiers beyond').tier, 'free')
  })

  await t.test('"freemium" alone is not the word "free"', () => {
    assert.equal(derivePricingTier('Freemium').rule, 'default')
  })
})

/* ═══ Tools ════════════════════════════════════════════════════════════════ */

await test('tools', async (t) => {
  await t.test('split on ";" first, else "," outside parentheses, then " / "', () => {
    assert.deepEqual(splitToolNames('BambooHR; Rippling'), ['BambooHR', 'Rippling'])
    assert.deepEqual(splitToolNames('Gainsight (PX, analytics), Pendo'), ['Gainsight (PX, analytics)', 'Pendo'])
    assert.deepEqual(splitToolNames('ChatGPT / Claude'), ['ChatGPT', 'Claude'])
    assert.deepEqual(splitToolNames('Motion'), ['Motion'])
  })

  await t.test('no separator inside parentheses splits a tool', () => {
    assert.deepEqual(splitToolNames('Todoist (AI Assist; Task Assist)'), ['Todoist (AI Assist; Task Assist)'])
    assert.deepEqual(splitToolNames('Gusto (Gus AI assistant; Cofounder); QuickBooks'), [
      'Gusto (Gus AI assistant; Cofounder)',
      'QuickBooks',
    ])
    assert.deepEqual(splitToolNames('AI prompts (M365 Copilot / Claude), Zendesk'), [
      'AI prompts (M365 Copilot / Claude)',
      'Zendesk',
    ])
  })

  await t.test('every named tool is kept; only the first has a url', () => {
    const { tools, matched } = buildTools('Motion; Notion AI; Unlisted', 'https://source.example', matcher)
    assert.deepEqual(tools, [
      { name: 'Motion', url: 'https://source.example' },
      { name: 'Notion AI', catalogueSlug: 'notion-ai' },
      { name: 'Unlisted' },
    ])
    assert.equal(matched, 1)
  })

  await t.test('a later tool over the name cap is dropped; the row keeps the rest', () => {
    const prose = 'a general AI assistant paired with an exported production report for smaller teams'
    const { tools, dropped } = buildTools(`Sisu; ${prose}; Notion AI`, 'https://source.example', matcher)
    assert.deepEqual(tools.map((tool) => tool.name), ['Sisu', 'Notion AI'])
    assert.deepEqual(dropped, [prose])
  })

  await t.test('an over-long FIRST tool is kept, so validation fails the row', () => {
    const long = 'A general-purpose AI assistant used alongside the spreadsheet you already maintain each week'
    assert.ok(long.length > 80)
    const { tools, dropped } = buildTools(`${long}; Notion AI`, 'https://source.example', matcher)
    assert.equal(tools[0]?.name, long)
    assert.deepEqual(dropped, [])
    const { record } = recordFrom(rowFor(SHAPE_A))
    assert.equal(AutomationSchema.safeParse({ ...record, tools }).success, false)
  })

  await t.test('a later tool exactly at the cap is kept', () => {
    const atCap = 'x'.repeat(80)
    assert.equal(buildTools(`Motion; ${atCap}`, 'https://s.example', matcher).tools.length, 2)
  })

  await t.test('url-less later tools pass the schema', () => {
    const { tools } = buildTools('Motion; Unlisted', 'https://source.example', matcher)
    const { record } = recordFrom(rowFor(SHAPE_A))
    assert.equal(AutomationSchema.safeParse({ ...record, tools }).success, true)
  })

  await t.test('a matched first tool keeps the Source URL and gains catalogueSlug', () => {
    const { tools } = buildTools('ChatGPT (GPT-4o)', 'https://source.example', matcher)
    assert.deepEqual(tools, [
      { name: 'ChatGPT (GPT-4o)', url: 'https://source.example', catalogueSlug: 'chatgpt' },
    ])
  })

  await t.test('matching is exact, never fuzzy', () => {
    assert.equal(matcher.match('Notion'), undefined)
    assert.equal(matcher.match('Google NotebookLM'), undefined)
    assert.equal(matcher.match('notion-ai')?.slug, 'notion-ai')
  })

  await t.test('a name two catalogue tools share matches neither', () => {
    const ambiguous = createCatalogueMatcher([
      makeTool({ id: 'a', slug: 'a', name: 'Echo' }),
      makeTool({ id: 'b', slug: 'b', name: 'Echo' }),
    ])
    assert.equal(ambiguous.match('Echo'), undefined)
  })
})

/* ═══ Slugs and dedupe ═════════════════════════════════════════════════════ */

await test('slugs', async (t) => {
  await t.test('a collision within a niche gets -2, -3', () => {
    assert.deepEqual(assignSlugs(['Plan my week', 'Plan my week!', 'plan-my-week', 'Other']), [
      'plan-my-week',
      'plan-my-week-2',
      'plan-my-week-3',
      'other',
    ])
  })

  await t.test('long titles truncate to 64 at a hyphen, suffix included', () => {
    const long = 'I want AI to research my ideal client profile and tell me who to reach out to'
    const [first, second] = assignSlugs([long, long])
    assert.ok(first && first.length <= 64 && !first.endsWith('-'), first)
    assert.ok(second && second.length <= 64 && second.endsWith('-2'), second)
    assert.equal(long.toLowerCase().replace(/[^a-z0-9]+/g, '-').startsWith(first ?? ''), true)
  })

  await t.test('the id is stable, niche-scoped and fits the cap', () => {
    const id = automationId('Fitness-Salon-Personal Services', 'Book my clients automatically')
    assert.equal(id, automationId('Fitness-Salon-Personal Services', 'book my clients, automatically!'))
    assert.notEqual(id, automationId('Students', 'Book my clients automatically'))
    assert.ok(id.length <= 64)
  })
})

await test('dedupe keeps the first occurrence', async (t) => {
  const rows = [
    { niche: 'Small Businesses', title: 'Send invoices', from: 'Batch1' },
    { niche: 'Small Businesses', title: 'Other task', from: 'Batch1' },
    { niche: 'Small Businesses', title: 'send  invoices!', from: 'Batch2' },
    { niche: 'Students', title: 'Send invoices', from: 'Batch1' },
  ]
  const { kept, dropped } = dedupeRows(rows)

  await t.test('the later copy is dropped, the first kept', () => {
    assert.deepEqual(kept.map((r) => r.from), ['Batch1', 'Batch1', 'Batch1'])
    assert.deepEqual(dropped, [rows[2]])
  })

  await t.test('the same title in another niche is not a duplicate', () => {
    assert.ok(kept.includes(rows[3] as (typeof rows)[number]))
  })

  await t.test('rows without a title are all kept, for validation to report', () => {
    const { kept: untitled } = dedupeRows([
      { niche: 'Students', title: '' },
      { niche: 'Students', title: '' },
    ])
    assert.equal(untitled.length, 2)
  })
})
