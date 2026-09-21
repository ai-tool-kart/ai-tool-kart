import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Button from '@/components/ui/Button'
import SubmitAdvancedSection from '@/components/submit/SubmitAdvancedSection'
import SubmitEssentialsSection from '@/components/submit/SubmitEssentialsSection'
import SubmitLaunchSection from '@/components/submit/SubmitLaunchSection'
import SubmitPreviewPanel from '@/components/submit/SubmitPreviewPanel'
import SubmitSuccess from '@/components/submit/SubmitSuccess'
import SubmitUrlSection from '@/components/submit/SubmitUrlSection'
import { useTaxonomy } from '@/hooks/useTaxonomy'
import { ApiRequestError } from '@/services/http'
import { submitTool } from '@/services/submissions'
import { createEmptySubmission, isSubmissionReady, toSubmissionPayload, type SubmitFormState } from '@/types/submit'
import { buildLaunchWeeks } from '@/utils/launchWeeks'

/*
 * Submit — "List your tool", inspired by brofindai.com/submit's four-step
 * flow (URL, Essentials, Advanced Details, Pricing & Scheduling), rebuilt on
 * this catalogue's own data model and design tokens rather than copied
 * pixel-for-pixel.
 *
 * Wired to POST /api/submissions (SPEC-submit-backend.md §8). SubmissionInputSchema
 * is `.strict()`, so the request body is built by types/submit.ts's
 * `toSubmissionPayload`, not the raw form — see that function's header for
 * the two places the form's own shape doesn't match the wire shape.
 */

type SubmitStatus = 'editing' | 'submitting' | 'done' | 'error'

/** A hung request shouldn't leave the button spinning forever. */
const SUBMIT_TIMEOUT_MS = 15_000

/**
 * Field keys `fields`-carrying errors can be attached to a real control for —
 * every top-level SubmissionInputSchema key with a `[data-field]`-tagged
 * input in the form below. A key outside this set (a `.strict()` violation's
 * `_`, or a nested path like `faqs.0.question` — unreachable in practice
 * since toSubmissionPayload drops incomplete FAQ rows before they can 400)
 * has nowhere to render next to, so it goes in the banner instead.
 */
const KNOWN_FIELDS = new Set([
  'siteUrl',
  'name',
  'tagline',
  'description',
  'category',
  'pricingModel',
  'price',
  'tags',
  'audience',
  'alternatives',
  'launchStory',
  'plan',
  'launchWeekId',
])

/** Visual order, for "focus the first errored field" after a failed submit. */
const FIELD_FOCUS_ORDER = [
  'siteUrl',
  'name',
  'tagline',
  'description',
  'category',
  'pricingModel',
  'price',
  'tags',
  'audience',
  'alternatives',
  'launchStory',
  'plan',
  'launchWeekId',
]

interface SubmitFailure {
  /** Per-field messages, rendered under their own input. */
  fieldErrors: Record<string, string>
  /** A message for the banner near the submit button — absent for a pure field error (409). */
  bannerMessage: string | undefined
}

function failureFrom(error: unknown): SubmitFailure {
  if (error instanceof ApiRequestError) {
    if (error.code === 'VALIDATION_FAILED' && error.fields) {
      const fieldErrors: Record<string, string> = {}
      const unmapped: string[] = []
      for (const [key, message] of Object.entries(error.fields)) {
        if (KNOWN_FIELDS.has(key)) fieldErrors[key] = message
        else unmapped.push(message)
      }
      return { fieldErrors, bannerMessage: unmapped.length > 0 ? unmapped.join(' ') : undefined }
    }
    if (error.code === 'DUPLICATE_URL') {
      // Spec: a 409 is a message on the URL field, not a banner.
      return { fieldErrors: { siteUrl: error.message }, bannerMessage: undefined }
    }
    if (error.code === 'RATE_LIMITED') {
      const minutes = error.retryAfterSeconds ? Math.max(1, Math.ceil(error.retryAfterSeconds / 60)) : undefined
      return {
        fieldErrors: {},
        bannerMessage: minutes
          ? `Too many submissions from this connection. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
          : error.message,
      }
    }
    // NETWORK and INTERNAL (500) both land here with an already human message.
    return { fieldErrors: {}, bannerMessage: error.message }
  }
  return {
    fieldErrors: {},
    bannerMessage: 'Something went wrong sending your submission. Check your connection and try again.',
  }
}

export default function SubmitPage() {
  const taxonomy = useTaxonomy()
  const [form, setForm] = useState<SubmitFormState>(createEmptySubmission)
  const [status, setStatus] = useState<SubmitStatus>('editing')
  // The form submitted, frozen at submit time — the success screen reads this,
  // not the live `form`, so further edits to `form` (there shouldn't be any,
  // since the fieldset below is disabled while submitting) can never change
  // what the confirmation reports.
  const [submittedForm, setSubmittedForm] = useState<SubmitFormState>(createEmptySubmission)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [bannerMessage, setBannerMessage] = useState<string | undefined>(undefined)

  const controllerRef = useRef<AbortController | undefined>(undefined)
  const timeoutRef = useRef<number | undefined>(undefined)
  const bannerRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const update = useCallback((patch: Partial<SubmitFormState>) => {
    setForm((current) => ({ ...current, ...patch }))
    // Editing a field clears that field's own error — it does not touch the
    // banner, which is only ever cleared by the next submit attempt.
    setFieldErrors((current) => {
      const changedKeys = Object.keys(patch).filter((key) => key in current)
      if (changedKeys.length === 0) return current
      const next = { ...current }
      for (const key of changedKeys) delete next[key]
      return next
    })
  }, [])

  const ready = isSubmissionReady(form)

  const runSubmit = useCallback(() => {
    if (!ready || status === 'submitting') return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    timeoutRef.current = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS)

    setSubmittedForm(form)
    setFieldErrors({})
    setBannerMessage(undefined)
    setStatus('submitting')

    submitTool(toSubmissionPayload(form), controller.signal)
      .then(() => {
        window.clearTimeout(timeoutRef.current)
        if (!mountedRef.current) return
        setStatus('done')
      })
      .catch((cause: unknown) => {
        window.clearTimeout(timeoutRef.current)
        if (!mountedRef.current) return
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          setFieldErrors({})
          setBannerMessage('That took too long. Check your connection and try again.')
          setStatus('error')
          return
        }
        const failure = failureFrom(cause)
        setFieldErrors(failure.fieldErrors)
        setBannerMessage(failure.bannerMessage)
        setStatus('error')
      })
  }, [form, ready, status])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runSubmit()
  }

  // Send failure to where a person can act on it: the first errored field if
  // there is one, the banner otherwise — the same "make it findable" rule
  // SubmitSuccess.tsx already applies to its confirmation heading.
  useEffect(() => {
    if (status !== 'error') return
    const firstFieldKey = FIELD_FOCUS_ORDER.find((key) => fieldErrors[key])
    if (firstFieldKey) {
      const container = document.querySelector(`[data-field="${firstFieldKey}"]`)
      const focusable = container?.querySelector<HTMLElement>('input, textarea, button, [role="radio"]')
      focusable?.focus()
    } else {
      bannerRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

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
          Four sections — your URL, the essentials, anything worth adding, and when it goes live. The card on the right builds itself as you go.
        </p>
      </header>

      <div className="relative mt-10 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <fieldset disabled={status === 'submitting'} className="contents">
            <SubmitUrlSection value={form.siteUrl} onChange={(siteUrl) => update({ siteUrl })} error={fieldErrors.siteUrl} />

            <SubmitEssentialsSection
              form={form}
              update={update}
              categories={taxonomy.data?.categories ?? []}
              pricingModels={taxonomy.data?.pricingModels ?? []}
              taxonomyFailed={taxonomy.failed}
              errors={fieldErrors}
            />

            <SubmitAdvancedSection form={form} update={update} errors={fieldErrors} />

            <SubmitLaunchSection
              plan={form.plan}
              onPlanChange={(plan) => update({ plan })}
              launchWeekId={form.launchWeekId}
              onLaunchWeekChange={(launchWeekId) => update({ launchWeekId })}
              errors={fieldErrors}
            />
          </fieldset>

          {status === 'error' && bannerMessage && (
            <div
              ref={bannerRef}
              tabIndex={-1}
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-[rgba(255,124,158,0.26)] bg-pink-bg px-4 py-3 text-[13.5px] leading-[1.5] text-pretty text-[#EBD3DC]"
            >
              <span>{bannerMessage}</span>
              <Button type="button" variant="ghost" onClick={runSubmit}>
                Try again
              </Button>
            </div>
          )}

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
