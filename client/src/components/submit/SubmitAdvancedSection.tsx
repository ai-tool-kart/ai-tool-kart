import { useId, useState } from 'react'
import FormField from '@/components/ui/FormField'
import SubmitSectionCard from '@/components/submit/SubmitSectionCard'
import TagInput from '@/components/submit/TagInput'
import {
  LAUNCH_STORY_MAX,
  MAX_ALTERNATIVES,
  MAX_FAQS,
  MAX_TAGS,
  type FaqDraft,
  type SubmitFormState,
} from '@/types/submit'

/*
 * Step 3 — everything brofindai files under "Advanced optimization": tags,
 * audience, alternatives, an FAQ builder and the launch story. All optional,
 * so it opens collapsed rather than asking for six more fields up front.
 */

interface SubmitAdvancedSectionProps {
  form: SubmitFormState
  update: (patch: Partial<SubmitFormState>) => void
  /** Validation messages keyed by field name, from a 400's `fields` map. */
  errors: Record<string, string>
}

function newFaq(): FaqDraft {
  return { id: Math.random().toString(36).slice(2), question: '', answer: '' }
}

export default function SubmitAdvancedSection({ form, update, errors }: SubmitAdvancedSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()

  const updateFaq = (id: string, patch: Partial<FaqDraft>) =>
    update({ faqs: form.faqs.map((faq) => (faq.id === id ? { ...faq, ...patch } : faq)) })

  const removeFaq = (id: string) => update({ faqs: form.faqs.filter((faq) => faq.id !== id) })

  return (
    <SubmitSectionCard
      step={3}
      title="Advanced details"
      description="Tags, audience, alternatives and an FAQ — sharper search results and fewer questions in your inbox."
      tag="Optional"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-pill border border-white/[0.09] bg-white/[0.035] px-4 py-[10px] text-[13.5px] font-medium text-muted-soft transition-[border-color,background-color,color] duration-200 hover:border-accent-line hover:bg-accent-wash hover:text-accent"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`h-[14px] w-[14px] transition-transform duration-300 ${expanded ? 'rotate-45' : ''}`}
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        {expanded ? 'Hide advanced details' : 'Add advanced details'}
      </button>

      {expanded && (
        <div id={panelId} className="flex flex-col gap-6 border-t border-hairline pt-6">
          <TagInput
            label="Tags"
            name="tags"
            hint="Up to six keywords people might search for."
            values={form.tags}
            onChange={(tags) => update({ tags })}
            placeholder="Type a tag and press Enter"
            max={MAX_TAGS}
            error={errors.tags}
          />

          <FormField
            label="Who is it for?"
            name="audience"
            value={form.audience}
            placeholder="e.g. Solo marketers and small content teams"
            onChange={(audience) => update({ audience })}
            error={errors.audience}
          />

          <TagInput
            label="Alternatives"
            name="alternatives"
            hint="Similar tools people already know, for comparison."
            values={form.alternatives}
            onChange={(alternatives) => update({ alternatives })}
            placeholder="Type a tool name and press Enter"
            max={MAX_ALTERNATIVES}
            error={errors.alternatives}
          />

          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] tracking-[0.05em] uppercase text-subtle">
                Frequently asked questions
              </span>
              <span className="text-[11px] font-medium tabular-nums text-subtle-dim">
                {form.faqs.length}/{MAX_FAQS}
              </span>
            </div>

            {form.faqs.map((faq, index) => (
              <div
                key={faq.id}
                className="flex flex-col gap-3 rounded-field border border-hairline bg-white/[0.025] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-semibold text-subtle-dim">Question {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeFaq(faq.id)}
                    aria-label="Remove this question"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-subtle-dim transition-colors duration-150 hover:bg-white/[0.1] hover:text-ink"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-[13px] w-[13px]">
                      <path d="M5 5l14 14M19 5 5 19" />
                    </svg>
                  </button>
                </div>
                <FormField
                  label="Question"
                  value={faq.question}
                  placeholder="Does it have a free trial?"
                  onChange={(question) => updateFaq(faq.id, { question })}
                />
                <FormField
                  label="Answer"
                  textarea
                  rows={2}
                  value={faq.answer}
                  placeholder="Yes — 14 days, no card required."
                  onChange={(answer) => updateFaq(faq.id, { answer })}
                />
              </div>
            ))}

            {form.faqs.length < MAX_FAQS && (
              <button
                type="button"
                onClick={() => update({ faqs: [...form.faqs, newFaq()] })}
                className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-pill border border-dashed border-white/[0.15] px-4 py-[9px] text-[13px] font-medium text-muted-dim transition-[border-color,color] duration-200 hover:border-accent-line hover:text-accent"
              >
                + Add a question
              </button>
            )}
          </div>

          <FormField
            label="Launch story"
            textarea
            rows={4}
            name="launchStory"
            value={form.launchStory}
            maxLength={LAUNCH_STORY_MAX}
            placeholder="Why you built it and what changed since the first version."
            onChange={(launchStory) => update({ launchStory: launchStory.slice(0, LAUNCH_STORY_MAX) })}
            error={errors.launchStory}
          />
        </div>
      )}
    </SubmitSectionCard>
  )
}
