/*
 * THE PORT.
 *
 * An interface and its query/page types. No implementation, no storage
 * vocabulary, no import of anything under data/.
 *
 * ASSISTANT_ARCHITECTURE_PLAN.md §6.2 fixes three decisions inside it, each
 * deliberate and each easy to undo by accident:
 *
 *   1. EVERY METHOD IS ASYNC, even though the JSON adapter is synchronous
 *      internally. If the interface were sync, swapping in PostgreSQL would
 *      change the signature of every call site up to the route handlers. Paying
 *      an unnecessary `await` in V1 buys a migration that touches one file.
 *
 *   2. ToolQuery IS EXPRESSED IN DOMAIN TERMS — categories, roles, stages,
 *      pricing tiers. It translates as cleanly to a SQL WHERE clause as to an
 *      array filter. No field on it leaks a JSON or a SQL concept.
 *
 *   3. THERE IS NO listAll(). Retrieval asks for what it needs through search(),
 *      so the prefilter pushes down into SQL later without restructuring the
 *      caller. An unfaceted query is `search({ limit: N })`.
 *
 * tests/catalogue.contract.ts is a reusable suite over this interface. It runs
 * against JsonToolCatalogue today and must run unchanged against
 * PostgresToolCatalogue later — that suite is what makes the migration safe.
 */

import type {
  PricingTier,
  RoleName,
  SortOption,
  Taxonomy,
  Tool,
  ToolCategoryName,
  ToolStatus,
  WorkflowStage,
} from '../domain/types.ts'

/**
 * A catalogue query.
 *
 * Every field is optional and every field narrows: omitting one means "do not
 * constrain on this", never "match nothing". Multiple values inside one field
 * are OR'd; separate fields are AND'd — the semantics a SQL `IN (…) AND …`
 * gives for free, so the two adapters cannot diverge on it.
 */
export interface ToolQuery {
  /** Free text. Matched against name, tagline, summary and tags. */
  q?: string
  categories?: ToolCategoryName[]
  pricingTiers?: PricingTier[]
  roles?: RoleName[]
  stages?: WorkflowStage[]
  tags?: string[]
  /** Inclusive floor. A tool with no ratings (rating 0) never passes a floor > 0. */
  minRating?: number
  excludeIds?: string[]
  /** Defaults to 'active'. Pass 'all' to include drafts — admin paths only. */
  status?: ToolStatus | 'all'
  sort?: SortOption
  limit?: number
  /** Opaque. Obtained from a previous page's nextCursor; never constructed. */
  cursor?: string
}

export interface ToolPage {
  items: Tool[]
  /** Absent when this is the last page. */
  nextCursor?: string
  /** Matches before limit/cursor were applied. */
  total: number
}

export interface ToolCatalogueRepository {
  /** Which adapter is behind the port: 'json' now, 'postgres' later. */
  readonly id: string
  findById(id: string): Promise<Tool | undefined>
  findBySlug(slug: string): Promise<Tool | undefined>
  /** Unknown ids are dropped. Order is not guaranteed to match the input. */
  findManyByIds(ids: string[]): Promise<Tool[]>
  search(query: ToolQuery): Promise<ToolPage>
  taxonomy(): Promise<Taxonomy>
  /** Active records only — the number a health check should report. */
  size(): Promise<number>
  /**
   * A tool whose own `url` normalizes (utils/normalizeUrl.ts) to `url` —
   * across every record, not just active ones, so an unpublished draft at
   * this address still counts. Backs the Submit intake's catalogue-side
   * duplicate check (SPEC-submit-backend.md §7 step 6). Deliberately a real
   * lookup rather than a `search()` scan: `search()` is capped at
   * RETRIEVAL.prefilterLimit, and a catalogue that outgrows that cap must
   * not be able to silently stop catching duplicates past the cutoff.
   */
  findByNormalizedUrl(url: string): Promise<Tool | undefined>
}
