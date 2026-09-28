import type {
  AutomationCard,
  GuideIssue,
  GuideRequirement,
  GuideResource,
  NicheName,
} from '@/types/automation'

/*
 * The workflow guide — the view model the guide page renders.
 *
 * `AutomationDetail` (types/automation.ts) mirrors the API field for field and
 * stays that way. This type is what the page needs from it: sections, not
 * columns. utils/workflowGuide.ts is the ONE place that builds it, from either
 * kind of record:
 *
 *   editorial guide  — a person wrote intro, steps, tips, issues… → used as is
 *   imported guide   — only the spreadsheet's fields             → fallback
 *
 * so no component ever asks "is this authored?" — it renders what is here.
 * An empty list means "render nothing": there is no placeholder copy.
 */

/** One tool as the guide shows it. */
export interface GuideTool {
  name: string
  /** Outbound link. */
  url?: string
  /**
   * Whether `url` is the tool's own site. An imported record's url is its
   * source, and most sources are roundups — "Open Jasper" landing on a blog
   * would be a link that lies. Authored tool urls are the tool's own.
   */
  urlIsToolSite: boolean
  /** A real catalogue record, linked to Browse's plan view. */
  catalogueSlug?: string
  accessNote?: string
  /** "Free" / "Free plan" / "Paid" — only when the API sent a tier, lead tool only. */
  priceLabel?: string
  /** Why this step uses this tool — authored guides only. */
  why?: string
}

export interface GuideStep {
  /** Anchor id, `step-1` — also the HowTo step's url fragment. */
  id: string
  /** 1-based. */
  number: number
  title: string
  body?: string
  instructions: string[]
  prompt?: string
  expectedOutcome?: string
  tips: string[]
  /** The tools this step uses. A tool belongs to a step, not to the guide. */
  tools: GuideTool[]
  alternatives: GuideTool[]
  resources: GuideResource[]
  cta?: { label: string; url: string }
  /** Article prose about the step. Empty on derived steps. */
  explanation: string[]
}

export interface GuideSource {
  url: string
  type: string
  freshness: string
  accessNotes?: string
}

export interface WorkflowGuide {
  niche: NicheName
  slug: string
  /** True when the steps were written by a person, not derived. */
  isEditorial: boolean
  /** False for the development-only demo guide (server automations/demo/): never indexed. */
  indexable: boolean
  /** The page's H1 — the editor's headline, else the record's task title. */
  title: string
  /** The record's task title, as a reader would type it. */
  taskTitle: string
  /** One or two sentences under the H1 — authored, else built from the step and tool counts. */
  lede: string
  /** ≤170 chars, for <meta name="description">. */
  metaDescription: string
  /** When a person last reviewed the guide (YYYY-MM-DD). Absent on imported guides. */
  updatedAt?: string
  /** Why this workflow matters, in paragraphs. Empty on an imported guide. */
  intro: string[]
  /** The record's workflowSummary — what the workflow does, end to end. */
  summary: string
  persona: string
  /** The source's own sector wording, only when it adds to `niche`. */
  sector?: string
  setupLabel: string
  setupNote?: string
  priceLabel?: string
  /** The record's intent labels — other ways people search for this task. */
  searchTerms: string[]
  /** Every tool in the workflow, deduplicated across steps, in step order. */
  tools: GuideTool[]
  steps: GuideStep[]
  outcomes: string[]
  requirements: GuideRequirement[]
  tips: string[]
  issues: GuideIssue[]
  resources: GuideResource[]
  /** Related guides — curated first, then the same niche; resolved by the server. */
  relatedGuides: AutomationCard[]
  /** What the reader ends up with. Authored only — absent otherwise. */
  expectedResult?: { summary: string; checklist: string[] }
  /** The closing call to action — authored, else a plain pointer back to step 1. */
  closing: { title: string; body: string }
  /** True when at least one step has written explanation — the article walkthrough renders. */
  hasWalkthrough: boolean
  readingMinutes: number
  source: GuideSource
}
