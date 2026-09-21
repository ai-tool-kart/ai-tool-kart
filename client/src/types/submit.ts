import type { PricingModel, PricingTierName, Tool, ToolCategoryName } from '@/types/tool'

/*
 * Local state for the Submit form, and its conversion to the wire payload
 * POST /api/submissions accepts (server/src/submissions/schema.ts).
 */

export type LaunchPlan = 'free' | 'featured'

export interface FaqDraft {
  id: string
  question: string
  answer: string
}

export interface SubmitFormState {
  siteUrl: string
  name: string
  tagline: string
  description: string
  category: ToolCategoryName | ''
  /**
   * String, not `PricingModel`, on purpose: it comes straight from the
   * taxonomy's `pricingModels` (display-only vocabulary, typed `string[]` for
   * the same reason there — see types/taxonomy.ts).
   */
  pricingModel: string
  /** Display price string, e.g. "Free tier + paid plans". Optional, mirrors Tool.price. */
  price: string
  tags: string[]
  audience: string
  alternatives: string[]
  launchStory: string
  faqs: FaqDraft[]
  plan: LaunchPlan
  launchWeekId: string
}

export const TAGLINE_MAX = 80
export const DESCRIPTION_MAX = 2000
export const LAUNCH_STORY_MAX = 600
export const MAX_TAGS = 6
export const MAX_ALTERNATIVES = 6
export const MAX_FAQS = 5

export function createEmptySubmission(): SubmitFormState {
  return {
    siteUrl: '',
    name: '',
    tagline: '',
    description: '',
    category: '',
    pricingModel: '',
    price: '',
    tags: [],
    audience: '',
    alternatives: [],
    launchStory: '',
    faqs: [],
    plan: 'free',
    launchWeekId: '',
  }
}

/**
 * True when a FAQ row is either fully filled in or fully empty — never
 * exactly one of question/answer. A half-filled row would otherwise be
 * silently dropped by `toSubmissionPayload` below, which reads to the person
 * who typed only one half as their input vanishing for no visible reason.
 */
export function isFaqRowComplete(faq: FaqDraft): boolean {
  return (faq.question.trim() !== '') === (faq.answer.trim() !== '')
}

/** Whether the required fields for a listing are filled in — gates the launch button. */
export function isSubmissionReady(form: SubmitFormState): boolean {
  return (
    form.siteUrl.trim() !== '' &&
    form.name.trim() !== '' &&
    form.tagline.trim() !== '' &&
    form.description.trim() !== '' &&
    form.category !== '' &&
    form.pricingModel !== '' &&
    form.launchWeekId !== '' &&
    form.faqs.every(isFaqRowComplete)
  )
}

/** The wire shape POST /api/submissions accepts — SubmissionInputSchema, client-side. */
export interface SubmissionPayload {
  siteUrl: string
  name: string
  tagline: string
  description: string
  category: string
  pricingModel: string
  price?: string
  tags: string[]
  audience?: string
  alternatives: string[]
  faqs: { question: string; answer: string }[]
  launchStory?: string
  plan: LaunchPlan
  launchWeekId: string
}

/**
 * Builds the request body from the form.
 *
 * Two things the form's shape doesn't match on its own:
 *  - `FaqDraft` carries a client-only `id` for React's `key`/editing, which
 *    `SubmissionInputSchema`'s `.strict()` FAQ object would reject outright.
 *  - A FAQ row the user opened and left entirely blank is dropped: an empty
 *    row is not information, it's an unused slot. A HALF-filled row (only a
 *    question or only an answer) is a different case and never reaches this
 *    function at all — `isSubmissionReady` blocks the submit itself and
 *    SubmitAdvancedSection.tsx shows the "add the other half, or remove
 *    this" error on the row directly, so silently dropping it here would
 *    bypass UI the user has already seen.
 *
 * Every string is trimmed here too, ahead of the schema's own `.trim()` —
 * redundant against the server, but it means what gets echoed back in
 * `submittedForm`-derived UI (the preview panel, a future receipt) matches
 * what the server actually stored.
 */
export function toSubmissionPayload(form: SubmitFormState): SubmissionPayload {
  return {
    siteUrl: form.siteUrl.trim(),
    name: form.name.trim(),
    tagline: form.tagline.trim(),
    description: form.description.trim(),
    category: form.category,
    pricingModel: form.pricingModel,
    price: form.price.trim(),
    tags: form.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
    audience: form.audience.trim(),
    alternatives: form.alternatives.map((alt) => alt.trim()).filter((alt) => alt !== ''),
    faqs: form.faqs
      .filter((faq) => faq.question.trim() !== '' && faq.answer.trim() !== '')
      .map((faq) => ({ question: faq.question.trim(), answer: faq.answer.trim() })),
    launchStory: form.launchStory.trim(),
    plan: form.plan,
    launchWeekId: form.launchWeekId,
  }
}

/**
 * The tier axis a card's colour and CTA key off. Same read as
 * components/catalogue/toolCardTone.ts: free and freemium are their own tier,
 * everything else reads as paid. This is a LOCAL heuristic for the preview
 * only — the real catalogue's `pricingTier` is an independent field the server
 * assigns, not something derived from `model` on the client.
 */
function previewPricingTier(model: PricingModel): PricingTierName {
  if (model === 'Free') return 'free'
  if (model === 'Freemium') return 'freemium'
  return 'paid'
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'your-tool'
  )
}

function monogramFor(name: string): string {
  const letters = name.trim().match(/[A-Za-z0-9]/g)
  if (!letters || letters.length === 0) return 'AI'
  return letters.slice(0, 2).join('').toUpperCase()
}

/**
 * Builds a real `Tool` from the draft so the live preview can render the exact
 * CatalogueToolCard every browse result uses — one card definition, not a
 * second one that could drift from it. Fields the form never collects (rating,
 * reviews, trend, badge, the spec row) are honestly-empty, the same convention
 * the seeded catalogue itself uses — see types/tool.ts.
 */
export function toPreviewTool(form: SubmitFormState): Tool {
  const model = (form.pricingModel || 'Freemium') as PricingModel

  return {
    id: 'preview',
    name: form.name.trim() || 'Your tool name',
    mono: monogramFor(form.name),
    cat: form.category || 'Writing',
    model,
    tagline: form.tagline.trim() || 'Your tagline appears here as you type.',
    rating: 0,
    reviews: 0,
    price: form.price.trim() || '—',
    trend: '',
    badge: '',
    tags: form.tags,
    pop: 0,
    api: '—',
    ctx: '—',
    team: '—',
    trial: '—',
    integr: '—',
    slug: slugify(form.name),
    url: form.siteUrl.trim() || '#',
    summary: form.description,
    roles: form.audience.trim() ? [form.audience.trim()] : [],
    useCases: [],
    stages: [],
    pricingTier: previewPricingTier(model),
    verified: false,
  }
}
