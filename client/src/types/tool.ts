/*
 * The catalogue contract.
 *
 * `Tool` mirrors the server's `ApiTool` (server/src/http/routes/tools.ts —
 * `Omit<Tool, 'status'>`, defined in server/src/domain/types.ts) FIELD FOR
 * FIELD. The server is authoritative; if the two ever disagree, this file is the
 * one that is wrong. `status` is the one field the API strips, because an
 * inactive tool is never served in the first place.
 *
 * The two halves of this interface have different origins and it matters:
 *
 *  - The DISPLAY fields (name, mono, cat, model, tagline, rating, …) were
 *    modelled on the Claude Design handoff's TOOLS array, which is why the
 *    server's own record carries design-shaped names like `mono` and `pop`.
 *    That was deliberate, so no adapter is needed between API and UI.
 *  - The CATALOGUE fields (slug, url, summary, roles, useCases, stages,
 *    pricingTier, verified) exist only on the server. They are what retrieval,
 *    the assistant and the taxonomy actually run on.
 *
 * ── What the seeded catalogue does and does not carry ─────────────────────────
 *
 * Verified against all 66 live records (GET /api/tools):
 *
 *   rating    0 on every tool          reviews  0 on every tool
 *   badge     "" on every tool         trend    "" on every tool
 *   api/ctx/team/trial/integr          "—" on every tool
 *   verified  true on every tool       model    Freemium 47 · Subscription 17 · Free 2
 *
 * These are honestly-empty seed fields, not missing data — the catalogue does
 * not run its own review programme, so it does not invent a rating. UI must
 * therefore treat every one of them as optional-in-practice and render nothing
 * rather than a zero. See components/tools/CatalogueToolCard.tsx.
 */

/** Pricing vocabulary as the record displays it. Server `PRICING_MODELS`. */
export type PricingModel = 'Free' | 'Freemium' | 'Subscription' | 'Credits' | 'Usage-based'

/** The three tiers the API actually FILTERS on. Server `PRICING_TIERS`. */
export type PricingTierName = 'free' | 'freemium' | 'paid'

/** Server `TOOL_CATEGORIES`. Ten values; the taxonomy endpoint serves them. */
export type ToolCategoryName =
  | 'Writing'
  | 'Image'
  | 'Code'
  | 'Video'
  | 'Audio'
  | 'Agents'
  | 'Data'
  | 'Design'
  | 'Research'
  | 'Marketing'

/** Server `WORKFLOW_STAGES`. Carried as strings; the taxonomy endpoint labels them. */
export type WorkflowStage = string

export interface Tool {
  id: string
  name: string
  /** Two-character monogram shown in the card avatar. */
  mono: string
  cat: ToolCategoryName
  model: PricingModel
  tagline: string
  /** 0 across the seeded catalogue — render nothing, not "0". */
  rating: number
  /** 0 across the seeded catalogue. */
  reviews: number
  /** Display string, e.g. "Free tier + paid plans". Not parseable. */
  price: string
  /** Week-over-week growth badge. "" across the seeded catalogue. */
  trend: string
  /** Editorial badge. "" across the seeded catalogue. */
  badge: string
  tags: string[]
  /** Editorial prominence score, 0–100. Drives the `popular` sort. */
  pop: number
  /** Spec fields. "—" across the seeded catalogue. */
  api: string
  ctx: string
  team: string
  trial: string
  integr: string

  /* ── Catalogue-only, added by the backend ───────────────────────────────── */
  /** URL-safe id. The key a future /tools/:slug route will use. */
  slug: string
  /** The vendor's own site. The only outbound link the card can honestly offer. */
  url: string
  /** Long description. Not shown on a card; for a detail page. */
  summary: string
  roles: string[]
  useCases: string[]
  stages: WorkflowStage[]
  /** What `price` filtering actually keys on. */
  pricingTier: PricingTierName
  verified: boolean
}

/**
 * The shape the retiring mock array provides.
 *
 * `data/tools.ts` predates the backend and carries only the display half. It
 * still feeds four surfaces that are redesigned in Milestone 4 (Featured,
 * Trending, the Compare teaser and the kitchen sink), so it cannot be deleted
 * yet — but it must not masquerade as a real catalogue record either.
 *
 * `Tool` is assignable to this, so a component typed on `LegacyMockTool` accepts
 * both. Nothing new should be typed on it. It disappears with the file.
 */
export type LegacyMockTool = Omit<
  Tool,
  'slug' | 'url' | 'summary' | 'roles' | 'useCases' | 'stages' | 'pricingTier' | 'verified'
>

/* ─── Browse state ──────────────────────────────────────────────────────────── */

/** Server `SORT_OPTIONS`. The API rejects anything else with a 400. */
export type SortOption = 'relevance' | 'popular' | 'rating' | 'reviews' | 'name'

/**
 * Browse filter state, in the API's own vocabulary.
 *
 * Deliberately NOT the design's display strings ("All categories", "Any",
 * "Most popular"): those would need translating on every request, and a
 * translation layer is where a URL and a query drift apart. The URL, this
 * object and the query string now all say `cat=Code&sort=name`.
 *
 * Empty array means "no filter on this axis", which is also how it is absent
 * from the URL and from the request.
 */
export interface ToolFilters {
  q: string
  cat: ToolCategoryName[]
  price: PricingTierName[]
  /**
   * Rating floor, 0–5 in steps of 0.5. 0 means no floor and is not sent.
   *
   * The API has always supported this; the control is wired straight to it. Be
   * aware of what the catalogue currently holds, though: `rating` is 0 on all 66
   * seeded records, so any floor above 0 legitimately returns nothing. The
   * filter is not broken when that happens — it is answering honestly about a
   * catalogue that has no ratings yet.
   */
  minRating: number
  sort: SortOption
}
