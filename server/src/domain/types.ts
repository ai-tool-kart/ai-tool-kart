/*
 * Domain types.
 *
 * The shapes every layer above the repository speaks in. Nothing here knows
 * where a tool is stored, and nothing here is a wire shape — http/routes owns
 * the API representation, and the JSON adapter owns the on-disk representation.
 *
 * The vocabulary types (ToolCategoryName, PricingTier, WorkflowStage, RoleName,
 * SortOption) are re-exported from catalogue/taxonomy.ts, which is the single
 * source of truth for every closed list (ASSISTANT_ARCHITECTURE_PLAN.md §5.3).
 * That import direction is deliberate: vocabulary is configuration, not storage,
 * so it does not cross the boundary §6.1 protects.
 */

import type {
  PricingModel,
  PricingTier,
  RoleName,
  SortOption,
  Taxonomy,
  ToolCategoryName,
  ToolStatus,
  WorkflowStage,
} from '../catalogue/taxonomy.ts'

export type {
  PricingModel,
  PricingTier,
  RoleName,
  SortOption,
  Taxonomy,
  ToolCategoryName,
  ToolStatus,
  WorkflowStage,
}

/**
 * A catalogue record.
 *
 * The first block is the display contract, kept field-for-field identical to
 * client/src/types/tool.ts so Phase G can retire client/src/data/tools.ts
 * without touching a component (§5.2). The second block is what recommendation
 * actually needs and the frontend does not have yet.
 *
 * Several display fields carry conservative values in the seed catalogue rather
 * than invented precision — see NOT_RECORDED and PROMINENCE in taxonomy.ts.
 */
export interface Tool {
  /* ── Display contract, mirrors client/src/types/tool.ts ─────────────────── */
  id: string
  name: string
  /** Two-character monogram shown in the card avatar. */
  mono: string
  cat: ToolCategoryName
  /** Display pricing chip. Must agree with `pricingTier`; the schema enforces it. */
  model: PricingModel
  tagline: string
  /** 1–5, or 0 meaning "no ratings collected yet". */
  rating: number
  reviews: number
  /** Display string. The seed derives it from `pricingTier`; it is not an amount. */
  price: string
  /** Growth badge, e.g. "+142%". Empty string means none. */
  trend: string
  /** Editorial badge. Empty string means none — never null or undefined. */
  badge: string
  tags: string[]
  /** Editorial prominence score, 0–100. See PROMINENCE in taxonomy.ts. */
  pop: number
  api: string
  ctx: string
  team: string
  trial: string
  integr: string

  /* ── Recommendation contract ────────────────────────────────────────────── */
  /** Stable URL key for the tool detail page. */
  slug: string
  /** The tool's own website, so the assistant can link out. */
  url: string
  /** Two or three sentences. This is what retrieval and later the LLM reason over. */
  summary: string
  roles: RoleName[]
  useCases: string[]
  stages: WorkflowStage[]
  pricingTier: PricingTier
  status: ToolStatus
  verified: boolean
}

/**
 * The compact form the assistant is shown, roughly forty tokens per record.
 *
 * Declared here in Phase C because retrieval already produces it; Phase D is the
 * first consumer. It exists so a candidate list can be serialised without the
 * display fields, which carry no signal for choosing between two tools.
 */
export interface ToolSummary {
  id: string
  name: string
  slug: string
  cat: ToolCategoryName
  pricingTier: PricingTier
  stages: WorkflowStage[]
  tagline: string
}

export function toToolSummary(tool: Tool): ToolSummary {
  return {
    id: tool.id,
    name: tool.name,
    slug: tool.slug,
    cat: tool.cat,
    pricingTier: tool.pricingTier,
    stages: [...tool.stages],
    tagline: tool.tagline,
  }
}
