import { beginnerLabel, priceLabel } from '@/components/automations/labels'
import type { AutomationDetail, AutomationStep, GuideRequirement, StepTool } from '@/types/automation'
import type { GuideStep, GuideTool, WorkflowGuide } from '@/types/guide'

/*
 * AutomationDetail → WorkflowGuide: the normalization layer. Pure — same
 * record, same guide.
 *
 * A record arrives in one of two shapes, and this file is the only place
 * that knows it:
 *
 *   EDITORIAL — a person wrote some or all of intro, learningOutcomes,
 *               beforeYouStart, steps, tips, commonIssues, resources and
 *               relatedGuides (server/src/automations/editorial/).
 *   IMPORTED  — only the spreadsheet's fields, and three derived steps.
 *
 * Each section falls back INDEPENDENTLY: an authored field is used as
 * written; a missing one gets the imported fallback below, or nothing.
 *
 * ── What the fallback may and may not do ─────────────────────────────────────
 *
 * It frames the record's own facts ("Access to {tool}", the setup note) and
 * never writes advice of its own. Tips, common issues, resources, the
 * expected result and the step walkthrough have no fallback at all: without
 * an editor they are empty, and the page hides them. The closing CTA falls
 * back to a plain pointer to step 1 — navigation, not a claim.
 */

const META_DESCRIPTION_MAX = 158
const WORDS_PER_MINUTE = 200

function sentenceCase(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const cased = trimmed[0].toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(cased) ? cased : `${cased}.`
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

function countWords(texts: (string | undefined)[]): number {
  return texts.reduce((sum, text) => sum + (text ? text.split(/\s+/).filter(Boolean).length : 0), 0)
}

/**
 * The tool's own site, judged from the imported record's source type
 * ("Product page", "Vendor pricing page") — never a directory, roundup or
 * comparison, even one that calls itself a product page.
 */
function isToolSite(sourceType: string): boolean {
  return (
    /product page|product feature|product\/tool|vendor (product|pricing)|official/i.test(sourceType) &&
    !/directory|roundup|comparison|blog/i.test(sourceType)
  )
}

/* ─── Tools ───────────────────────────────────────────────────────────────── */

/** The record's own tools — what an imported guide's steps point into. */
function recordTools(detail: AutomationDetail): GuideTool[] {
  return detail.tools.map((tool, index) => ({
    name: tool.name,
    url: tool.url,
    // An imported tool's url is always its record's source url (the importer).
    urlIsToolSite: tool.url ? isToolSite(detail.sourceType) : false,
    catalogueSlug: tool.catalogueSlug,
    accessNote: tool.accessNote,
    // The record's tier describes its lead tool — the one its source is about.
    priceLabel: index === 0 && detail.pricingTier ? priceLabel(detail.pricingTier) : undefined,
  }))
}

/**
 * A tool as an authored step names it. What the editor wrote wins; the
 * record's matching tool (same name) fills in what they left out — its
 * catalogue link, access note and price label.
 */
function authoredTool(tool: StepTool, known: GuideTool[]): GuideTool {
  const match = known.find((candidate) => candidate.name === tool.name)
  return {
    name: tool.name,
    url: tool.url ?? match?.url,
    // An editor's url is the tool's own; a borrowed one keeps its judgement.
    urlIsToolSite: tool.url ? true : (match?.urlIsToolSite ?? false),
    catalogueSlug: tool.catalogueSlug ?? match?.catalogueSlug,
    accessNote: tool.accessNote ?? match?.accessNote,
    priceLabel: match?.priceLabel,
    why: tool.why,
  }
}

/** Every step's tools, first appearance wins, in step order. */
function workflowTools(steps: GuideStep[], fallback: GuideTool[]): GuideTool[] {
  const seen = new Map<string, GuideTool>()
  for (const tool of steps.flatMap((step) => step.tools)) {
    if (!seen.has(tool.name)) seen.set(tool.name, tool)
  }
  return seen.size > 0 ? [...seen.values()] : fallback
}

/* ─── Steps ───────────────────────────────────────────────────────────────── */

function buildStep(step: AutomationStep, index: number, known: GuideTool[]): GuideStep {
  // A derived step points into the record's tools by name; an authored one
  // carries its own list.
  const derivedTool = step.toolName ? known.find((tool) => tool.name === step.toolName) : undefined
  const tools = step.tools
    ? step.tools.map((tool) => authoredTool(tool, known))
    : derivedTool
      ? [derivedTool]
      : []

  // A derived step's `tip` is its tool's access note, which the tool card
  // already shows beside it — once is enough.
  const tips = [...(step.tips ?? []), ...(step.tip ? [step.tip] : [])].filter(
    (tip) => !tools.some((tool) => tool.accessNote === tip),
  )

  return {
    id: `step-${index + 1}`,
    number: index + 1,
    title: step.title,
    body: step.body,
    instructions: step.instructions ?? [],
    prompt: step.prompt,
    expectedOutcome: step.expectedOutcome,
    tips,
    tools,
    alternatives: (step.alternatives ?? []).map((tool) => authoredTool(tool, known)),
    resources: step.resources ?? [],
    cta: step.cta,
    explanation: step.explanation ?? [],
  }
}

/* ─── Imported-guide fallbacks ────────────────────────────────────────────── */

/** Built only from the record: tool access, and its own setup note. */
function fallbackRequirements(detail: AutomationDetail, tools: GuideTool[]): GuideRequirement[] {
  const requirements: GuideRequirement[] = tools.map((tool) => ({
    title: `Access to ${tool.name}`,
    description: [tool.priceLabel, tool.accessNote].filter(Boolean).join(' · ') || undefined,
  }))
  if (detail.beginnerNote) requirements.push({ title: sentenceCase(detail.beginnerNote) })
  return requirements
}

/** What the page itself covers — structural facts, not promises. */
function fallbackOutcomes(tools: GuideTool[], hasPrompt: boolean, hasRequirements: boolean): string[] {
  return [
    `Which tool${tools.length > 1 ? 's' : ''} to use — ${listNames(tools.map((tool) => tool.name))}`,
    ...(hasPrompt ? ['A ready-to-use prompt you can copy and adapt'] : []),
    'How the workflow runs, one step at a time',
    ...(hasRequirements ? ['What you need in place before you start'] : []),
  ]
}

/* ─── The guide ───────────────────────────────────────────────────────────── */

export function buildWorkflowGuide(detail: AutomationDetail): WorkflowGuide {
  const known = recordTools(detail)
  const steps = detail.steps.map((step, index) => buildStep(step, index, known))
  const tools = workflowTools(steps, known)
  const hasPrompt = steps.some((step) => step.prompt)

  const requirements = detail.beforeYouStart ?? fallbackRequirements(detail, tools)
  const outcomes = detail.learningOutcomes ?? fallbackOutcomes(tools, hasPrompt, requirements.length > 0)
  const tips = detail.tips ?? []
  const issues = detail.commonIssues ?? []
  const intro = detail.intro ?? []

  const lede =
    detail.lede ??
    `A ${steps.length}-step AI workflow using ${listNames(tools.map((tool) => tool.name))}${
      hasPrompt ? ', with the exact prompt to start from' : ''
    }.`
  const firstStep = steps[0]
  const closing = detail.closing ?? {
    title: 'Ready to try it?',
    body: firstStep
      ? `Start with step 1, “${firstStep.title}”, and work through the ${steps.length} steps above.`
      : 'Work through the steps above.',
  }

  const words = countWords([
    detail.title,
    detail.lede,
    ...intro,
    detail.workflowSummary,
    detail.expectedResult?.summary,
    ...(detail.expectedResult?.checklist ?? []),
    ...steps.flatMap((step) => [
      step.title,
      step.body,
      ...step.instructions,
      step.prompt,
      step.expectedOutcome,
      ...step.explanation,
      ...step.tips,
      ...step.tools.map((tool) => tool.why),
    ]),
    ...tips,
    ...issues.flatMap((issue) => [issue.problem, issue.solution]),
  ])

  return {
    niche: detail.niche,
    slug: detail.slug,
    isEditorial: detail.stepsSource === 'authored',
    // The demo record's batch is "DEMO — editorial layer example…" (server
    // automations/demo/records/demo.json). It only loads in development, but
    // if a dev API were ever prerendered it must still not be indexed.
    indexable: !detail.batch.startsWith('DEMO'),
    title: detail.headline ?? detail.title,
    taskTitle: detail.title,
    lede,
    metaDescription:
      detail.metaDescription ?? truncate(`${intro[0] ?? detail.workflowSummary} ${lede}`, META_DESCRIPTION_MAX),
    updatedAt: detail.updatedAt,
    intro,
    summary: detail.workflowSummary,
    persona: detail.persona,
    sector: detail.sector && detail.sector !== detail.niche ? detail.sector : undefined,
    setupLabel: beginnerLabel(detail.beginnerFriendly),
    setupNote: detail.beginnerNote ? sentenceCase(detail.beginnerNote) : undefined,
    priceLabel: known[0]?.priceLabel,
    searchTerms: detail.intentLabels,
    tools,
    steps,
    outcomes,
    requirements,
    tips,
    issues,
    resources: detail.resources ?? [],
    relatedGuides: detail.relatedGuides ?? [],
    expectedResult: detail.expectedResult
      ? { summary: detail.expectedResult.summary, checklist: detail.expectedResult.checklist ?? [] }
      : undefined,
    closing,
    hasWalkthrough: steps.some((step) => step.explanation.length > 0),
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    source: {
      url: detail.sourceUrl,
      type: detail.sourceType,
      freshness: detail.freshness,
      accessNotes: detail.accessNotes,
    },
  }
}
