/*
 * GET /api/automations and GET /api/automations/:niche/:slug.
 *
 * SPEC-automations.md §9. The handlers depend on the AutomationRepository
 * INTERFACE and on the pure matcher; they never touch the filesystem and never
 * import the JSON adapter (boundary.test.ts).
 *
 * ── Two paths, one shape ─────────────────────────────────────────────────────
 *
 * With `?q=` the list is ranked by automations/match.ts; without it, it is the
 * repository's listing in import order. Both return the same trimmed card
 * projection, so a client cannot tell which ran — the same rule tools.ts keeps.
 *
 * ── What never leaves the server ─────────────────────────────────────────────
 *
 * `pricingNote` is stored and NEVER rendered (§6): prices move monthly and
 * every row is flagged "verify before publishing". Neither endpoint returns
 * it; the reader gets `pricingTier` and a link to `sourceUrl` instead. `status`
 * is dropped as tools.ts drops it — a public client only ever sees 'active'.
 *
 * ── Why the detail route takes the niche ─────────────────────────────────────
 *
 * Slugs are unique within a niche only; one real slug is shared by Contractors
 * & Home Services and Small Businesses. `/automations/:slug` alone would have
 * to pick one.
 */

import { Router } from 'express'
import { z } from 'zod'
import { deriveSteps } from '../../automations/deriveSteps.ts'
import { createAutomationMatcher, type AutomationMatcher } from '../../automations/match.ts'
import type { AutomationRepository } from '../../automations/repository.ts'
import type { Automation, AutomationStep } from '../../automations/types.ts'
import { AUTOMATIONS, AUTOMATIONS_API } from '../../config/limits.ts'
import { notFound } from '../../domain/errors.ts'
import { CATALOGUE_KINDS, NICHES, type PricingTier } from '../../domain/types.ts'
import { parseOrThrow } from '../validate.ts'

/** What a result card needs, and nothing more. */
export interface ApiAutomationCard {
  slug: string
  niche: string
  title: string
  persona: string
  /** Tool names only — the card lists them; links live on the detail view. */
  tools: string[]
  beginnerFriendly: Automation['beginnerFriendly']
  /** Absent when no pricing rule recognised the note — no badge beats a guessed one. */
  pricingTier?: PricingTier
}

/**
 * The full record for the detail view: steps resolved; pricingNote, status and
 * pricingTierSource removed; pricingTier absent when it was only a default.
 */
export type ApiAutomation = Omit<
  Automation,
  'pricingNote' | 'status' | 'steps' | 'pricingTier' | 'pricingTierSource'
> & {
  pricingTier?: PricingTier
  steps: AutomationStep[]
}

export interface AutomationListResponse {
  items: ApiAutomationCard[]
}

export interface AutomationResponse {
  automation: ApiAutomation
}

/** The tier, only when a pricing rule actually recognised the note. */
function shownTier(automation: Automation): { pricingTier?: PricingTier } {
  return automation.pricingTierSource === 'matched' ? { pricingTier: automation.pricingTier } : {}
}

function toCard(automation: Automation): ApiAutomationCard {
  return {
    slug: automation.slug,
    niche: automation.niche,
    title: automation.title,
    persona: automation.persona,
    tools: automation.tools.map((tool) => tool.name),
    beginnerFriendly: automation.beginnerFriendly,
    ...shownTier(automation),
  }
}

function toDetail(automation: Automation): ApiAutomation {
  const {
    pricingNote: _pricingNote,
    status: _status,
    pricingTier: _pricingTier,
    pricingTierSource: _pricingTierSource,
    steps,
    ...rest
  } = automation
  // Authored steps win; otherwise the three derived at render time (§5). Never stored.
  return { ...rest, ...shownTier(automation), steps: steps ?? deriveSteps(automation) }
}

/**
 * A niche outside the vocabulary. One line in the message; the 25 allowed
 * values travel in details.fields[].allowed (http/validate.ts).
 */
const nicheSchema = z.enum(NICHES, { error: 'is not a known niche' })

/**
 * Query parameters for GET /api/automations. Unknown parameters are rejected,
 * and a niche or kind outside the vocabulary is a 400 — an empty list would
 * look like "no automations" rather than "you misspelled the niche".
 */
const ListQuerySchema = z
  .object({
    q: z.string().trim().max(AUTOMATIONS_API.maxQueryLength).optional(),
    niche: nicheSchema.optional(),
    kind: z.enum(CATALOGUE_KINDS).optional(),
    limit: z.coerce.number().int().min(1).max(AUTOMATIONS_API.maxLimit).optional(),
  })
  .strict()

const DetailParamsSchema = z
  .object({
    niche: nicheSchema,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase hyphenated slug')
      .max(AUTOMATIONS.slugMaxChars),
  })
  .strict()

export interface AutomationsRouteOptions {
  automations: AutomationRepository
}

export function createAutomationsRouter({ automations }: AutomationsRouteOptions): Router {
  const router = Router()

  // Built on first search and kept: the repository's set is fixed for the life
  // of the process, so indexing it per request would repeat a constant.
  let matcher: Promise<AutomationMatcher> | undefined
  const getMatcher = (): Promise<AutomationMatcher> => {
    matcher ??= automations.list().then((all) => createAutomationMatcher(all))
    return matcher
  }

  router.get('/', (req, res, next) => {
    void (async () => {
      try {
        const query = parseOrThrow(ListQuerySchema, req.query, 'query')
        const limit = query.limit ?? AUTOMATIONS_API.defaultLimit
        const filters = {
          ...(query.niche ? { niche: query.niche } : {}),
          ...(query.kind ? { kind: query.kind } : {}),
        }

        const found =
          query.q !== undefined && query.q.length > 0
            ? (await getMatcher()).match(query.q, { ...filters, limit }).map((m) => m.automation)
            : await automations.list({ ...filters, limit })

        const body: AutomationListResponse = { items: found.map(toCard) }
        res.json(body)
      } catch (error) {
        next(error)
      }
    })()
  })

  router.get('/:niche/:slug', (req, res, next) => {
    void (async () => {
      try {
        const { niche, slug } = parseOrThrow(DetailParamsSchema, req.params, 'params')
        const automation = await automations.findBySlug(niche, slug)
        if (!automation || automation.status !== 'active') {
          // A draft is reported as missing, as tools.ts does.
          throw notFound(`No automation matches "${slug}" in ${niche}.`, { niche, slug })
        }
        const body: AutomationResponse = { automation: toDetail(automation) }
        res.json(body)
      } catch (error) {
        next(error)
      }
    })()
  })

  return router
}
