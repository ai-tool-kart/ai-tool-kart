import { useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import SpotCard from '@/components/ui/SpotCard'
import type { SubmitFormState } from '@/types/submit'

interface SubmitSuccessProps {
  form: SubmitFormState
  weekLabel: string | undefined
  onSubmitAnother: () => void
  /**
   * The signed-in submitter's status page (/account/submissions/:id). Absent
   * for an anonymous submission (no database on the server), which has no
   * status page to show.
   */
  statusHref?: string
}

export default function SubmitSuccess({ form, weekLabel, onSubmitAnother, statusHref }: SubmitSuccessProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // This component only exists once status has flipped to 'done', so a mount
  // effect IS "when the submission succeeds" — no extra dependency needed.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    // role="status" is on a plain wrapper, not SpotCard itself: SpotCard
    // doesn't forward arbitrary props to its root element (see its props
    // interface), so passing role there wouldn't reach the DOM.
    <div role="status">
      <SpotCard topHairline className="mx-auto flex max-w-[560px] flex-col items-center gap-5 rounded-panel-lg px-8 py-14 text-center">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.16] bg-[image:var(--gradient-cta)] shadow-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-7 w-7">
            <path d="m4 12.5 5 5L20 6" />
          </svg>
        </span>

        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-[28px] font-bold tracking-[-0.03em] text-ink">
            You're on the list
          </h1>
          <p className="mt-3 max-w-[46ch] text-[14.5px] leading-[1.65] text-pretty text-muted-dim">
            <span className="font-semibold text-ink">{form.name}</span> is queued for{' '}
            {form.plan === 'featured' ? 'a Featured launch' : 'a Free launch'}
            {weekLabel ? (
              <>
                {' '}
                in the week of <span className="font-semibold text-ink">{weekLabel}</span>
              </>
            ) : null}
            .{' '}
            {statusHref
              ? "We'll review your submission and update its status here."
              : "We'll review your submission before it goes live."}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button to="/" variant="outline">
            Back to homepage
          </Button>
          {statusHref && (
            <Button to={statusHref} variant="gradient">
              View status
            </Button>
          )}
          <Button onClick={onSubmitAnother} variant={statusHref ? 'outline' : 'gradient'}>
            Submit another tool
          </Button>
        </div>
      </SpotCard>
    </div>
  )
}
