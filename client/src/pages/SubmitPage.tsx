import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Button from '@/components/ui/Button'
import SubmitAdvancedSection from '@/components/submit/SubmitAdvancedSection'
import SubmitEssentialsSection from '@/components/submit/SubmitEssentialsSection'
import SubmitLaunchSection from '@/components/submit/SubmitLaunchSection'
import SubmitPreviewPanel from '@/components/submit/SubmitPreviewPanel'
import SubmitSuccess from '@/components/submit/SubmitSuccess'
import SubmitUrlSection from '@/components/submit/SubmitUrlSection'
import { useTaxonomy } from '@/hooks/useTaxonomy'
import { createEmptySubmission, isSubmissionReady, type SubmitFormState } from '@/types/submit'
import { buildLaunchWeeks } from '@/utils/launchWeeks'

/*
 * Submit — "List your tool", inspired by brofindai.com/submit's four-step
 * flow (URL, Essentials, Advanced Details, Pricing & Scheduling), rebuilt on
 * this catalogue's own data model and design tokens rather than copied
 * pixel-for-pixel.
 *
 * There is no intake endpoint on the server yet (see server/src/http/routes) —
 * backend work is a later phase per CLAUDE.md — so "Launch listing" simulates
 * the round trip and hands back a confirmation. Wiring this to a real POST is
 * the natural next step once that route exists.
 */

type SubmitStatus = 'editing' | 'submitting' | 'done'

export default function SubmitPage() {
  const taxonomy = useTaxonomy()
  const [form, setForm] = useState<SubmitFormState>(createEmptySubmission)
  const [status, setStatus] = useState<SubmitStatus>('editing')
  // The form submitted, frozen at submit time — the success screen reads this,
  // not the live `form`, so further edits to `form` (there shouldn't be any,
  // since the fieldset below is disabled while submitting) can never change
  // what the confirmation reports.
  const [submittedForm, setSubmittedForm] = useState<SubmitFormState>(createEmptySubmission)
  // Started from the handleSubmit event handler, not from an effect, so it's
  // tracked in a ref and cleared on unmount below rather than via an effect's
  // own cleanup return.
  const submitTimerRef = useRef<number>()

  useEffect(() => {
    return () => window.clearTimeout(submitTimerRef.current)
  }, [])

  const update = useCallback((patch: Partial<SubmitFormState>) => {
    setForm((current) => ({ ...current, ...patch }))
  }, [])

  const ready = isSubmissionReady(form)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready || status === 'submitting') return
    setSubmittedForm(form)
    setStatus('submitting')
    submitTimerRef.current = window.setTimeout(() => setStatus('done'), 900)
  }

  if (status === 'done') {
    const weekLabel = buildLaunchWeeks().find((week) => week.id === submittedForm.launchWeekId)?.label
    return (
      <section className="relative mx-auto max-w-site px-8 pt-16 pb-[88px]">
        <SubmitSuccess
          form={submittedForm}
          weekLabel={weekLabel}
          onSubmitAnother={() => {
            setForm(createEmptySubmission())
            setStatus('editing')
          }}
        />
      </section>
    )
  }

  return (
    <section className="relative mx-auto max-w-site px-8 pt-16 pb-[88px]">
      {/* The two drifting mesh glows the design puts behind every sub-page screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[4%] left-[-12%] h-[520px] w-[58%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(124,88,244,0.2)_0%,rgba(96,52,210,0.06)_48%,transparent_76%)] blur-[46px] [animation:akMeshA_72s_cubic-bezier(.45,0,.55,1)_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[26%] right-[-16%] h-[600px] w-[52%] bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgba(154,110,255,0.16)_0%,rgba(202,168,255,0.05)_46%,transparent_74%)] blur-[52px] [animation:akMeshB_88s_cubic-bezier(.45,0,.55,1)_infinite]"
      />

      <header className="relative">
        <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">Submit</p>
        <h1 className="mt-3 text-[clamp(34px,5vw,52px)] font-bold tracking-[-0.04em] text-ink">List your tool</h1>
        <p className="mt-[14px] max-w-[62ch] text-[15.5px] leading-[1.65] tracking-[-0.006em] text-pretty text-muted-dim">
          Four short steps — your URL, the essentials, anything worth adding, and when it goes live. The card on the
          right builds itself as you go.
        </p>
      </header>

      <div className="relative mt-10 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <fieldset disabled={status === 'submitting'} className="contents">
            <SubmitUrlSection value={form.siteUrl} onChange={(siteUrl) => update({ siteUrl })} />

            <SubmitEssentialsSection
              form={form}
              update={update}
              categories={taxonomy.data?.categories ?? []}
              pricingModels={taxonomy.data?.pricingModels ?? []}
              taxonomyFailed={taxonomy.failed}
            />

            <SubmitAdvancedSection form={form} update={update} />

            <SubmitLaunchSection
              plan={form.plan}
              onPlanChange={(plan) => update({ plan })}
              launchWeekId={form.launchWeekId}
              onLaunchWeekChange={(launchWeekId) => update({ launchWeekId })}
            />
          </fieldset>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-6">
            <Button to="/" variant="subtle">
              Cancel
            </Button>
            <button
              type="submit"
              disabled={!ready || status === 'submitting'}
              aria-disabled={!ready || status === 'submitting'}
              className="inline-flex cursor-pointer items-center gap-2 rounded-pill border border-white/[0.16] bg-[image:var(--gradient-cta)] px-6 py-[13px] text-[14.5px] font-semibold text-white shadow-button transition-[transform,box-shadow,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:shadow-button-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-button"
            >
              {status === 'submitting' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="h-4 w-4 animate-spin">
                  <path d="M12 3a9 9 0 1 0 9 9" />
                </svg>
              )}
              {status === 'submitting' ? 'Launching…' : 'Launch listing'}
            </button>
          </div>
        </form>

        <SubmitPreviewPanel form={form} />
      </div>
    </section>
  )
}
