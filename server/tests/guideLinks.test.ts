/*
 * Hand-picked guide links: every stored one resolves, and nothing else is linked.
 *
 * Three pieces of editorial content can point at a step-by-step guide, each
 * chosen by hand from docs/LINK-CANDIDATES.md (the "good fit" rows only):
 *
 *   usage stories   server/src/stories/data/stories.json   `automation`
 *   AI setups       client/src/data/aiSetups.ts            `automation`
 *   Build roles     client/src/data/roleGuides.ts          ROLE_GUIDES
 *
 * A link is a { niche, slug } pair into the imported automations. Nothing ties
 * the two together at runtime, so a re-import that renames, drops or retires a
 * guide would leave a card pointing at a 404 with nothing to say so. This file
 * is that something: every stored pair must name an ACTIVE imported guide.
 *
 * It also pins which items are linked. Every story card links (three matched
 * to a guide, five rewritten around one). The setups and roles not listed
 * below are pending a client decision and must keep today's behaviour — which
 * is exactly "has no link" — so a link added without that decision fails here.
 *
 * ── Why a server test reads client files ─────────────────────────────────────
 *
 * The setup and role links live in the client, but the automations are loaded
 * here and this is the suite that runs. Both client files import types only,
 * which Node strips, so they load as plain modules. The path is computed rather
 * than written as a literal so the server's typecheck never follows it into the
 * client's `@/` aliases.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createJsonAutomations } from '../src/automations/json.ts'
import { ROLES } from '../src/catalogue/taxonomy.ts'
import { createJsonUsageStoryRepository } from '../src/stories/json.ts'
import { parseStories } from '../src/stories/schema.ts'
import type { UsageStory } from '../src/domain/types.ts'
import type { UsageStoryListResponse } from '../src/http/routes/usageStories.ts'
import { readJson, testContainer, withServer } from './helpers.ts'

interface GuideRef {
  niche: string
  slug: string
}

/**
 * Every story card links. Three were matched to an existing guide (the ✅ rows
 * in docs/LINK-CANDIDATES.md); the other five were rewritten around a guide
 * that exists, so no card is left unlinked.
 */
const LINKED_STORIES = [
  'restaurant-owner-menu',
  'video-editor-shorts',
  'career-changer-interviews',
  'freelance-designer-ad-visuals',
  'agency-founder-followups',
  'estate-agent-neighbourhood-guide',
  'startup-founder-market-research',
  'studio-owner-local-ads',
]
/** The decision recorded in docs/LINK-CANDIDATES.md — the ✅ rows, and only those. */
const LINKED_SETUPS = [
  'seo-blog-production',
  'social-content-pipeline',
  'saas-landing-page',
  'product-image-workflow',
  'long-video-to-shorts',
  'lead-generation-stack',
  'campaign-research-copy',
  'meeting-to-action-items',
  'competitor-analysis',
  'narration-and-dubbing',
  'inbox-and-task-triage',
]
const LINKED_ROLES = ['Graphic Designer', 'Video Editor', 'Content Creator', 'Writer', 'Student', 'Data Analyst']

const automations = createJsonAutomations()
const stories = await createJsonUsageStoryRepository().list()

const clientModule = (path: string): Promise<Record<string, unknown>> =>
  import(new URL(`../../client/src/${path}`, import.meta.url).href)
const { AI_SETUPS } = (await clientModule('data/aiSetups.ts')) as {
  AI_SETUPS: Array<{ id: string; automation?: GuideRef }>
}
const { ROLE_GUIDES } = (await clientModule('data/roleGuides.ts')) as {
  ROLE_GUIDES: Record<string, GuideRef>
}

/** Null when the pair names an active imported guide, otherwise why not. */
async function problemWith(ref: GuideRef): Promise<string | null> {
  const found = await automations.findBySlug(ref.niche, ref.slug)
  if (!found) return `${ref.niche}/${ref.slug} is not an imported guide`
  if (found.status !== 'active') return `${ref.niche}/${ref.slug} is ${found.status}, not active`
  return null
}

async function unresolved(entries: Array<[string, GuideRef]>): Promise<string[]> {
  const problems: string[] = []
  for (const [owner, ref] of entries) {
    const problem = await problemWith(ref)
    if (problem) problems.push(`${owner}: ${problem}`)
  }
  return problems
}

await test('hand-picked guide links', async (t) => {
  await t.test('every usage-story link names an active imported guide', async () => {
    const linked = stories.filter((story) => story.automation)
    assert.ok(linked.length > 0, 'the scan found linked stories')
    assert.deepEqual(await unresolved(linked.map((s) => [s.id, s.automation as GuideRef])), [])
  })

  await t.test('every setup link names an active imported guide', async () => {
    const linked = AI_SETUPS.filter((setup) => setup.automation)
    assert.ok(linked.length > 0, 'the scan found linked setups')
    assert.deepEqual(await unresolved(linked.map((s) => [s.id, s.automation as GuideRef])), [])
  })

  await t.test('every role link names an active imported guide, under a real role', async () => {
    const entries = Object.entries(ROLE_GUIDES)
    assert.ok(entries.length > 0, 'the scan found linked roles')
    assert.deepEqual(await unresolved(entries), [])
    // A key the picker can never hand back would be a link nobody can reach.
    const roles: readonly string[] = ROLES
    assert.deepEqual(entries.map(([role]) => role).filter((role) => !roles.includes(role)), [])
  })

  await t.test('every story card is linked, and to eight different niches', () => {
    assert.deepEqual(
      stories.filter((s) => s.automation).map((s) => s.id).sort(),
      [...LINKED_STORIES].sort(),
    )
    assert.equal(stories.length, LINKED_STORIES.length, 'a story without a link')
    // The rail shows different kinds of work; two cards opening guides from
    // the same niche would say the opposite.
    const niches = stories.map((s) => s.automation?.niche)
    assert.equal(new Set(niches).size, stories.length, `niches repeat: ${niches.join(', ')}`)
  })

  await t.test('exactly the chosen setups are linked; every other setup still asks the assistant', () => {
    assert.equal(AI_SETUPS.length, 19)
    assert.deepEqual(
      AI_SETUPS.filter((s) => s.automation).map((s) => s.id).sort(),
      [...LINKED_SETUPS].sort(),
    )
  })

  await t.test('exactly the chosen roles are linked; every other role still asks the assistant', () => {
    assert.deepEqual(Object.keys(ROLE_GUIDES).sort(), [...LINKED_ROLES].sort())
  })

  await t.test('the story schema rejects a malformed link rather than storing it', () => {
    const base = stories.find((s) => s.id === 'video-editor-shorts') as UsageStory
    for (const automation of [
      { niche: 'Podcasters', slug: 'i-want-to-turn-my-long-youtube-video-into-short-viral-clips' },
      { niche: 'Content Creators-Writers', slug: 'Not A Slug' },
      { niche: 'Content Creators-Writers' },
      { niche: 'Content Creators-Writers', slug: 'a-b', title: 'extra key' },
    ]) {
      assert.throws(
        () => parseStories([{ ...base, automation }], { origin: 'test' }),
        `must reject ${JSON.stringify(automation)}`,
      )
    }
  })

  await t.test('GET /api/usage-stories carries the link on linked stories and omits it elsewhere', async () => {
    await withServer(testContainer(), async ({ origin }) => {
      const response = await fetch(`${origin}/api/usage-stories`)
      assert.equal(response.status, 200)
      const { items } = await readJson<UsageStoryListResponse>(response)

      for (const item of items) {
        if (LINKED_STORIES.includes(item.id)) {
          const stored = stories.find((s) => s.id === item.id)
          assert.deepEqual(item.automation, stored?.automation, item.id)
        } else {
          assert.equal('automation' in item, false, `${item.id} must not carry a link`)
        }
      }
    })
  })
})
