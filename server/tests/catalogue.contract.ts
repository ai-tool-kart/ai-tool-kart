/*
 * THE REUSABLE CATALOGUE CONTRACT SUITE.
 *
 * Not a test file — a suite exported as a function that takes a repository
 * factory. tests/catalogue.test.ts runs it against JsonToolCatalogue today, and
 * a PostgresToolCatalogue must pass it UNCHANGED tomorrow. That is what makes
 * the migration in ASSISTANT_ARCHITECTURE_PLAN.md §16.1 safe rather than
 * hopeful: the assertions below are the definition of what the port promises,
 * and anything an adapter does beyond them is an implementation detail no caller
 * may rely on.
 *
 * Two rules for anything added here:
 *
 *   1. Assert only what the PORT promises. If an assertion could not be
 *      satisfied by a SQL implementation, it belongs in catalogue.test.ts
 *      against the concrete adapter instead.
 *
 *   2. Build every expectation from the fixture set passed in, never from a
 *      hardcoded id. The suite must not care which records it is given, only
 *      that they satisfy the shape CONTRACT_FIXTURES describes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { ToolCatalogueRepository } from '../src/catalogue/repository.ts'
import type { Tool } from '../src/domain/types.ts'
import { makeTool } from './helpers.ts'

/**
 * The fixture set every adapter is tested against.
 *
 * Shaped so each contract assertion has something to bite on: two categories,
 * all three pricing tiers, a draft record, a rated and an unrated record,
 * overlapping and disjoint stages, and enough records to page through.
 */
export const CONTRACT_FIXTURES: Tool[] = [
  makeTool({
    id: 'alpha-writer',
    slug: 'alpha-writer',
    name: 'Alpha Writer',
    cat: 'Writing',
    tags: ['Long-form', 'Shared'],
    pop: 90,
    rating: 4.5,
    reviews: 100,
    model: 'Free',
    pricingTier: 'free',
    roles: ['Writer'],
    stages: ['draft', 'edit'],
  }),
  makeTool({
    id: 'beta-coder',
    slug: 'beta-coder',
    name: 'Beta Coder',
    cat: 'Code',
    tags: ['Autocomplete', 'Shared'],
    pop: 80,
    rating: 4.0,
    reviews: 50,
    model: 'Subscription',
    pricingTier: 'paid',
    roles: ['Developer'],
    useCases: ['Write code faster'],
    stages: ['build'],
  }),
  makeTool({
    id: 'gamma-writer',
    slug: 'gamma-writer',
    name: 'Gamma Writer',
    cat: 'Writing',
    tags: ['Rewriting'],
    pop: 70,
    rating: 0,
    reviews: 0,
    model: 'Freemium',
    pricingTier: 'freemium',
    roles: ['Writer', 'Student'],
    stages: ['edit'],
  }),
  makeTool({
    id: 'delta-coder',
    slug: 'delta-coder',
    name: 'Delta Coder',
    cat: 'Code',
    tags: ['Testing'],
    pop: 60,
    rating: 3.5,
    reviews: 10,
    model: 'Freemium',
    pricingTier: 'freemium',
    roles: ['Developer'],
    useCases: ['Generate tests'],
    stages: ['build', 'edit'],
  }),
  makeTool({
    id: 'epsilon-draft',
    slug: 'epsilon-draft',
    name: 'Epsilon Unreleased',
    cat: 'Writing',
    tags: ['Unreleased'],
    pop: 100,
    rating: 5,
    reviews: 1,
    model: 'Free',
    pricingTier: 'free',
    roles: ['Writer'],
    stages: ['draft'],
    status: 'draft',
  }),
]

const ACTIVE_IDS = CONTRACT_FIXTURES.filter((tool) => tool.status === 'active').map((t) => t.id)
const DRAFT = CONTRACT_FIXTURES.find((tool) => tool.status === 'draft') as Tool

export interface ContractOptions {
  /** Names the adapter in the test output: "JsonToolCatalogue", "Postgres…". */
  name: string
  /** Builds a repository holding exactly CONTRACT_FIXTURES. */
  create: () => Promise<ToolCatalogueRepository> | ToolCatalogueRepository
}

export async function runCatalogueContract({ name, create }: ContractOptions): Promise<void> {
  const repo = async (): Promise<ToolCatalogueRepository> => create()

  await test(`ToolCatalogueRepository contract — ${name}`, async (t) => {
    await t.test('identifies which adapter is behind the port', async () => {
      const catalogue = await repo()
      assert.equal(typeof catalogue.id, 'string')
      assert.ok(catalogue.id.length > 0, 'id is what GET /api/health reports as the driver')
    })

    /* ── Lookup ───────────────────────────────────────────────────────────── */

    await t.test('findById returns the record', async () => {
      const catalogue = await repo()
      const tool = await catalogue.findById('alpha-writer')
      assert.equal(tool?.name, 'Alpha Writer')
    })

    await t.test('findById on an unknown id resolves undefined, never throws', async () => {
      const catalogue = await repo()
      assert.equal(await catalogue.findById('no-such-tool'), undefined)
    })

    await t.test('findBySlug returns the record', async () => {
      const catalogue = await repo()
      assert.equal((await catalogue.findBySlug('beta-coder'))?.id, 'beta-coder')
    })

    await t.test('findBySlug on a missing slug resolves undefined, never throws', async () => {
      const catalogue = await repo()
      assert.equal(await catalogue.findBySlug('not-a-slug'), undefined)
    })

    await t.test('lookup by id reaches drafts — status filtering is search-level', async () => {
      // Callers that already hold an id (an admin view, a hydration step) get the
      // record; deciding whether a draft may be shown is the caller's job.
      const catalogue = await repo()
      assert.equal((await catalogue.findById(DRAFT.id))?.status, 'draft')
    })

    /* ── findManyByIds ────────────────────────────────────────────────────── */

    await t.test('findManyByIds returns every known id', async () => {
      const catalogue = await repo()
      const found = await catalogue.findManyByIds(['alpha-writer', 'beta-coder'])
      assert.deepEqual(
        found.map((tool) => tool.id).sort(),
        ['alpha-writer', 'beta-coder'],
      )
    })

    await t.test('findManyByIds drops unknown ids instead of failing', async () => {
      const catalogue = await repo()
      const found = await catalogue.findManyByIds(['alpha-writer', 'ghost', 'beta-coder'])
      assert.equal(found.length, 2)
    })

    await t.test('findManyByIds deduplicates a repeated id', async () => {
      const catalogue = await repo()
      const found = await catalogue.findManyByIds(['alpha-writer', 'alpha-writer'])
      assert.equal(found.length, 1)
    })

    await t.test('findManyByIds on an empty list returns an empty array', async () => {
      const catalogue = await repo()
      assert.deepEqual(await catalogue.findManyByIds([]), [])
    })

    /* ── Status ───────────────────────────────────────────────────────────── */

    await t.test('search excludes drafts by default', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ limit: 100 })
      assert.equal(page.items.some((tool) => tool.status === 'draft'), false)
      assert.equal(page.total, ACTIVE_IDS.length)
    })

    await t.test("status: 'all' includes drafts", async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ status: 'all', limit: 100 })
      assert.equal(page.total, CONTRACT_FIXTURES.length)
      assert.ok(page.items.some((tool) => tool.id === DRAFT.id))
    })

    await t.test("status: 'draft' returns only drafts", async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ status: 'draft', limit: 100 })
      assert.deepEqual(page.items.map((tool) => tool.id), [DRAFT.id])
    })

    /* ── Facets ───────────────────────────────────────────────────────────── */

    await t.test('categories filters, and multiple values are OR-ed', async () => {
      const catalogue = await repo()
      const writing = await catalogue.search({ categories: ['Writing'], limit: 100 })
      assert.ok(writing.items.every((tool) => tool.cat === 'Writing'))
      assert.ok(writing.items.length > 0)

      const both = await catalogue.search({ categories: ['Writing', 'Code'], limit: 100 })
      assert.equal(both.total, ACTIVE_IDS.length)
    })

    await t.test('pricingTiers filters on the parseable tier, not the display chip', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ pricingTiers: ['freemium'], limit: 100 })
      assert.ok(page.items.length > 0)
      assert.ok(page.items.every((tool) => tool.pricingTier === 'freemium'))
    })

    await t.test('roles matches a tool serving any requested role', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ roles: ['Developer'], limit: 100 })
      assert.ok(page.items.length > 0)
      assert.ok(page.items.every((tool) => tool.roles.includes('Developer')))
    })

    await t.test('stages matches a tool covering any requested stage', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ stages: ['edit'], limit: 100 })
      assert.ok(page.items.length > 0)
      assert.ok(page.items.every((tool) => tool.stages.includes('edit')))
    })

    await t.test('tags matches case-insensitively', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ tags: ['shared'], limit: 100 })
      assert.deepEqual(page.items.map((tool) => tool.id).sort(), ['alpha-writer', 'beta-coder'])
    })

    await t.test('minRating is an inclusive floor', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ minRating: 4.0, limit: 100 })
      assert.ok(page.items.length > 0)
      assert.ok(page.items.every((tool) => tool.rating >= 4.0))
    })

    await t.test('an unrated record never satisfies a rating floor above zero', async () => {
      // rating 0 means "no ratings collected", so it must not be treated as a
      // score that happens to be low — but it must also never pass a filter.
      const catalogue = await repo()
      const page = await catalogue.search({ minRating: 0.5, limit: 100 })
      assert.equal(page.items.some((tool) => tool.rating === 0), false)
    })

    await t.test('facets combine with AND', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({
        categories: ['Code'],
        pricingTiers: ['freemium'],
        limit: 100,
      })
      assert.deepEqual(page.items.map((tool) => tool.id), ['delta-coder'])
    })

    await t.test('an unsatisfiable combination returns an empty page, not an error', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({
        categories: ['Code'],
        roles: ['Writer'],
        limit: 100,
      })
      assert.deepEqual(page.items, [])
      assert.equal(page.total, 0)
      assert.equal(page.nextCursor, undefined)
    })

    /* ── Exclusions ───────────────────────────────────────────────────────── */

    await t.test('excludeIds removes the named records', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ excludeIds: ['alpha-writer'], limit: 100 })
      assert.equal(page.items.some((tool) => tool.id === 'alpha-writer'), false)
      assert.equal(page.total, ACTIVE_IDS.length - 1)
    })

    await t.test('excluding an unknown id changes nothing', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ excludeIds: ['ghost'], limit: 100 })
      assert.equal(page.total, ACTIVE_IDS.length)
    })

    /* ── Free text ────────────────────────────────────────────────────────── */

    await t.test('q matches the name', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ q: 'Gamma', limit: 100 })
      assert.deepEqual(page.items.map((tool) => tool.id), ['gamma-writer'])
    })

    await t.test('q is case-insensitive', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ q: 'gAmMa', limit: 100 })
      assert.deepEqual(page.items.map((tool) => tool.id), ['gamma-writer'])
    })

    await t.test('q matches tags as well as prose', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ q: 'autocomplete', limit: 100 })
      assert.deepEqual(page.items.map((tool) => tool.id), ['beta-coder'])
    })

    await t.test('q that matches nothing returns an empty page', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ q: 'zzzznomatch', limit: 100 })
      assert.deepEqual(page.items, [])
      assert.equal(page.total, 0)
    })

    /* ── Sorting ──────────────────────────────────────────────────────────── */

    await t.test('sort: popular orders by descending prominence', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ sort: 'popular', limit: 100 })
      const pops = page.items.map((tool) => tool.pop)
      assert.deepEqual(pops, [...pops].sort((a, b) => b - a))
    })

    await t.test('sort: rating orders by descending rating', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ sort: 'rating', limit: 100 })
      const ratings = page.items.map((tool) => tool.rating)
      assert.deepEqual(ratings, [...ratings].sort((a, b) => b - a))
    })

    await t.test('sort: name orders alphabetically', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ sort: 'name', limit: 100 })
      const names = page.items.map((tool) => tool.name)
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
    })

    await t.test('ordering is total, so repeated identical queries agree', async () => {
      const catalogue = await repo()
      const first = await catalogue.search({ sort: 'popular', limit: 100 })
      const second = await catalogue.search({ sort: 'popular', limit: 100 })
      assert.deepEqual(
        first.items.map((tool) => tool.id),
        second.items.map((tool) => tool.id),
      )
    })

    /* ── Pagination ───────────────────────────────────────────────────────── */

    await t.test('limit caps the page while total reports the full match count', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ limit: 2 })
      assert.equal(page.items.length, 2)
      assert.equal(page.total, ACTIVE_IDS.length)
      assert.ok(page.nextCursor, 'more records remain, so a cursor must be offered')
    })

    await t.test('the last page carries no nextCursor', async () => {
      const catalogue = await repo()
      const page = await catalogue.search({ limit: 100 })
      assert.equal(page.nextCursor, undefined)
    })

    await t.test('cursors walk every record exactly once', async () => {
      const catalogue = await repo()
      const seen: string[] = []
      let cursor: string | undefined
      let guard = 0

      do {
        const page: Awaited<ReturnType<typeof catalogue.search>> = await catalogue.search({
          limit: 2,
          sort: 'popular',
          ...(cursor ? { cursor } : {}),
        })
        seen.push(...page.items.map((tool) => tool.id))
        cursor = page.nextCursor
        guard += 1
        assert.ok(guard < 20, 'pagination must terminate')
      } while (cursor)

      assert.deepEqual(seen.sort(), [...ACTIVE_IDS].sort())
      assert.equal(new Set(seen).size, seen.length, 'no record appears on two pages')
    })

    await t.test('a cursor round-trips against the unpaged result', async () => {
      const catalogue = await repo()
      const all = await catalogue.search({ sort: 'popular', limit: 100 })
      const first = await catalogue.search({ sort: 'popular', limit: 2 })
      const second = await catalogue.search({
        sort: 'popular',
        limit: 2,
        cursor: first.nextCursor as string,
      })

      assert.deepEqual(
        [...first.items, ...second.items].map((tool) => tool.id),
        all.items.slice(0, 4).map((tool) => tool.id),
      )
    })

    await t.test('a malformed cursor restarts rather than throwing', async () => {
      // A stale bookmark or a truncated URL must degrade to page one; a 500 for
      // a bad cursor would make every shared link a liability.
      const catalogue = await repo()
      const page = await catalogue.search({ cursor: 'not-a-real-cursor', limit: 2 })
      assert.equal(page.items.length, 2)
    })

    await t.test('a cursor past the end returns an empty final page', async () => {
      const catalogue = await repo()
      const cursor = Buffer.from(JSON.stringify({ o: 999 }), 'utf8').toString('base64url')
      const page = await catalogue.search({ cursor, limit: 5 })
      assert.deepEqual(page.items, [])
      assert.equal(page.nextCursor, undefined)
      assert.equal(page.total, ACTIVE_IDS.length, 'total still describes the whole match set')
    })

    /* ── Taxonomy and size ────────────────────────────────────────────────── */

    await t.test('taxonomy exposes every published vocabulary', async () => {
      const catalogue = await repo()
      const taxonomy = await catalogue.taxonomy()
      for (const key of [
        'categories',
        'pricingTiers',
        'pricingModels',
        'roles',
        'useCases',
        'stages',
        'sorts',
      ] as const) {
        assert.ok(
          Array.isArray(taxonomy[key]) && taxonomy[key].length > 0,
          `taxonomy.${key} must be a non-empty list`,
        )
      }
      assert.ok(Object.keys(taxonomy.goalsByRole).length > 0)
    })

    await t.test('size counts active records only', async () => {
      const catalogue = await repo()
      assert.equal(await catalogue.size(), ACTIVE_IDS.length)
    })

    /* ── Async contract ───────────────────────────────────────────────────── */

    await t.test('every method returns a promise', async () => {
      // Not pedantry. If a caller ever relies on a synchronous return, swapping
      // in a real database breaks it — which is the entire reason §6.2 requires
      // the port to be async even while the V1 adapter is not.
      const catalogue = await repo()
      const calls = [
        catalogue.findById('alpha-writer'),
        catalogue.findBySlug('alpha-writer'),
        catalogue.findManyByIds(['alpha-writer']),
        catalogue.search({}),
        catalogue.taxonomy(),
        catalogue.size(),
      ]
      for (const call of calls) assert.ok(call instanceof Promise)
      await Promise.all(calls)
    })
  })
}
