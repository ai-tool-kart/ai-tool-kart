/*
 * RetrievalService — the coordinator.
 *
 *   user query + context
 *        ↓  normalize.ts
 *   repository.search()          ← the PORT, never the JSON adapter
 *        ↓  score.ts
 *        ↓  select.ts
 *   RetrievalResult
 *
 * This module imports ToolCatalogueRepository and nothing else from catalogue/
 * except vocabulary types. It does not know a JSON file exists, and swapping in
 * PostgresToolCatalogue changes nothing here — that is the boundary
 * ASSISTANT_ARCHITECTURE_PLAN.md §6.1 exists to protect.
 *
 * ── Hard filters versus soft signals ──────────────────────────────────────────
 *
 * The one judgement call in this file. Constraints the CALLER stated — a budget,
 * a category chip, an excluded id — are pushed into the repository as hard
 * filters. Everything INFERRED from the text is left as a scoring signal.
 *
 * Inferring "Video" from "edit videos faster" and then filtering to Video would
 * mean Descript ranks first out of a set that can no longer contain ElevenLabs,
 * and the assistant could not build the audio step of a video workflow. An
 * inference is a guess; a guess must not be able to delete a right answer.
 */

import { RETRIEVAL } from '../config/limits.ts'
import type { ToolCatalogueRepository, ToolQuery } from '../catalogue/repository.ts'
import type {
  CatalogueKind,
  PricingTier,
  Taxonomy,
  Tool,
  ToolCategoryName,
  WorkflowStage,
} from '../domain/types.ts'
import type { Logger } from '../utils/logger.ts'
import { normalizeQuery, type NormalizedQuery, type QueryContext } from './normalize.ts'
import { hasQuerySignal, indexTool, scoreTool, type ScoredTool } from './score.ts'
import { selectCandidates, type StageCoverage } from './select.ts'

export interface RetrievalRequest {
  /** The user's words. May be empty when the caller only supplies facets. */
  query?: string
  context?: QueryContext
  /** Hard filters. Stated by the caller, never inferred. */
  filters?: {
    categories?: ToolCategoryName[]
    pricingTiers?: PricingTier[]
    minRating?: number
    excludeIds?: string[]
    /** See ToolQuery.kind: only 'mcp' narrows. */
    kind?: CatalogueKind
  }
  /** Candidates to return. Clamped to RETRIEVAL.maxCandidates. */
  limit?: number
}

/**
 * What retrieval hands back.
 *
 * `interpretation` and `coverage` exist so a test — or a person reading a log —
 * can answer "why these tools" without re-running anything. The HTTP layer
 * deliberately does not forward the per-signal breakdown to clients (§10 of the
 * Phase C brief): it is a debugging surface, not an API contract.
 */
export interface RetrievalResult {
  candidates: ScoredTool[]
  interpretation: {
    raw: string
    terms: string[]
    categories: ToolCategoryName[]
    roles: string[]
    stages: WorkflowStage[]
    useCases: string[]
    pricingTiers: PricingTier[]
    /** Nothing usable in the query — the caller should ask for clarification. */
    empty: boolean
  }
  coverage: StageCoverage[]
  unmetStages: WorkflowStage[]
  /** Records the repository returned before scoring. */
  considered: number
}

export interface RetrievalService {
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>
  /** Convenience for the browse endpoint: ranked tools, no candidate capping. */
  rank(request: RetrievalRequest): Promise<Tool[]>
  taxonomy(): Promise<Taxonomy>
  size(): Promise<number>
}

export interface CreateRetrievalServiceOptions {
  catalogue: ToolCatalogueRepository
  logger?: Logger
}

export function createRetrievalService({
  catalogue,
  logger,
}: CreateRetrievalServiceOptions): RetrievalService {
  /** Runs everything up to selection, shared by retrieve() and rank(). */
  async function scoreCandidates(
    request: RetrievalRequest,
  ): Promise<{ normalized: NormalizedQuery; scored: ScoredTool[] }> {
    const normalized = normalizeQuery(request.query ?? '', request.context ?? {})

    const query: ToolQuery = {
      status: 'active',
      limit: RETRIEVAL.prefilterLimit,
    }
    if (request.filters?.categories?.length) query.categories = request.filters.categories
    if (request.filters?.pricingTiers?.length) query.pricingTiers = request.filters.pricingTiers
    if (request.filters?.minRating !== undefined) query.minRating = request.filters.minRating
    if (request.filters?.kind) query.kind = request.filters.kind

    // Two sources of exclusion, both hard: an explicit filter and a tool the
    // user has already turned down in conversation.
    const excludeIds = [
      ...new Set([...(request.filters?.excludeIds ?? []), ...normalized.rejectedToolIds]),
    ]
    if (excludeIds.length > 0) query.excludeIds = excludeIds

    const page = await catalogue.search(query)
    const scored = page.items.map((tool) => scoreTool(tool, normalized, indexTool(tool)))

    return { normalized, scored }
  }

  return {
    async retrieve(request) {
      const { normalized, scored } = await scoreCandidates(request)

      const selection = selectCandidates({
        scored,
        stages: normalized.stages,
        ...(request.limit !== undefined ? { limit: request.limit } : {}),
      })

      logger?.debug('Retrieval complete', {
        terms: normalized.terms.length,
        considered: scored.length,
        candidates: selection.candidates.length,
        unmetStages: selection.unmetStages,
      })

      return {
        candidates: selection.candidates,
        interpretation: {
          raw: normalized.raw,
          terms: normalized.terms,
          categories: normalized.categories,
          roles: normalized.roles,
          stages: normalized.stages,
          useCases: normalized.useCases,
          pricingTiers: normalized.pricingTiers,
          empty: normalized.empty,
        },
        coverage: selection.coverage,
        unmetStages: selection.unmetStages,
        considered: scored.length,
      }
    },

    async rank(request) {
      const { normalized, scored } = await scoreCandidates(request)

      /*
       * Drop records the query did not actually touch.
       *
       * Without this, `?q=edit videos faster` reports 66 results — the whole
       * catalogue, ordered by relevance — because scoring ranks rather than
       * filters. Ranked-but-unmatched is the right pool for the assistant and
       * the wrong answer under a search box.
       *
       * The exception is a query that normalised to nothing ("the", "???"): we
       * did not understand it, so claiming zero matches would be a stronger
       * statement than we can make. Those fall through to popularity order.
       */
      const relevant = normalized.empty ? scored : scored.filter(hasQuerySignal)

      return relevant
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          if (b.tool.pop !== a.tool.pop) return b.tool.pop - a.tool.pop
          return a.tool.id.localeCompare(b.tool.id)
        })
        .map((entry) => entry.tool)
    },

    taxonomy() {
      return catalogue.taxonomy()
    },

    size() {
      return catalogue.size()
    },
  }
}
