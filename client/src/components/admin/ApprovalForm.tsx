import { useState, type FormEvent } from 'react'
import { CheckboxGroup } from '@/components/admin/AdminControls'
import { Notice, Panel, ResourceView } from '@/components/admin/AdminStates'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import { describeError, useAdminResource, useSessionAwareAction } from '@/hooks/useAdminResource'
import { approveSubmission, fetchAdminVocabulary } from '@/services/admin'
import { ApiRequestError } from '@/services/http'
import type { AdminSubmissionDetail, AdminVocabulary, ApprovalFields } from '@/types/admin'
import { approvalFieldErrors, splitTags, type ApprovalFieldErrors } from '@/utils/adminForms'

/*
 * The fields an approval confirms before the server builds the catalogue
 * record — the same ones the review CLI asks for. Pre-filled from the
 * server's `proposal`; every closed list comes from GET /admin/vocabulary,
 * so the choices are the catalogue's own taxonomy, not a copy of it.
 *
 * The server validates the WHOLE resulting record with the catalogue schema;
 * its field errors ("tool.stages", "tool.roles.0", "tool.id") are mapped
 * back onto the inputs here. The record is created as a DRAFT: approval does
 * not publish anything to the live site.
 */

function Form({
  submission,
  vocabulary,
  busy,
  setBusy,
  onCancel,
  onApproved,
  onError,
}: {
  submission: AdminSubmissionDetail
  vocabulary: AdminVocabulary
  busy: boolean
  setBusy: (busy: boolean) => void
  onCancel: () => void
  onApproved: (next: AdminSubmissionDetail) => void
  onError: (error: unknown) => void
}) {
  const run = useSessionAwareAction()
  const proposal = submission.proposal
  const [fields, setFields] = useState<ApprovalFields>(
    proposal ?? { slug: '', mono: '', price: '', pop: 0, roles: [], stages: [], useCases: [], tags: [], summary: '' },
  )
  const [tagsText, setTagsText] = useState((proposal?.tags ?? []).join(', '))
  const [errors, setErrors] = useState<ApprovalFieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const limits = vocabulary.toolFields

  const set = <K extends keyof ApprovalFields>(key: K, value: ApprovalFields[K]) => setFields((current) => ({ ...current, [key]: value }))
  const tags = splitTags(tagsText)

  const review = (event: FormEvent) => {
    event.preventDefault()
    setConfirming(true)
  }

  const approve = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const next = await run(() => approveSubmission(submission.id, { ...fields, tags }))
      setConfirming(false)
      onApproved(next)
    } catch (error) {
      setConfirming(false)
      if (error instanceof ApiRequestError && error.fields) setErrors(approvalFieldErrors(error.fields))
      setMessage(describeError(error, 'Approval failed. Try again.'))
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Approve into the catalogue">
      <form onSubmit={review} className="flex flex-col gap-5" aria-label="Approval">
        <p className="text-[14px] leading-[1.6] text-muted-soft">
          Approving creates a <strong className="text-ink">draft</strong> catalogue record from this submission and makes the submitter its
          owner. It does not publish anything to the live site.
        </p>
        {message && <Notice tone="error">{message}</Notice>}
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Slug (catalogue id)"
            name="slug"
            value={fields.slug}
            onChange={(value) => set('slug', value)}
            maxLength={limits.slugMaxChars}
            hint="Lowercase words joined by hyphens. Becomes the tool’s permanent id."
            error={errors.slug}
            required
          />
          <FormField
            label="Monogram"
            name="mono"
            value={fields.mono}
            onChange={(value) => set('mono', value)}
            maxLength={limits.monoLength}
            hint={`Exactly ${limits.monoLength} characters, shown on the card.`}
            error={errors.mono}
            required
          />
          <FormField
            label="Price"
            name="price"
            value={fields.price}
            onChange={(value) => set('price', value)}
            maxLength={limits.priceMaxChars}
            error={errors.price}
            required
          />
          <FormField
            label="Prominence (pop)"
            name="pop"
            type="number"
            value={String(fields.pop)}
            onChange={(value) => set('pop', Number.parseInt(value, 10) || 0)}
            hint={`${limits.popMin}–${limits.popMax}. New tools usually start low.`}
            error={errors.pop}
            required
          />
        </div>
        <FormField
          label="Summary"
          name="summary"
          textarea
          rows={4}
          value={fields.summary}
          onChange={(value) => set('summary', value)}
          maxLength={limits.summaryMaxChars}
          hint={`${limits.summaryMinChars}–${limits.summaryMaxChars} characters. What search and the assistant read.`}
          error={errors.summary}
          required
        />
        <FormField
          label="Tags"
          name="tags"
          value={tagsText}
          onChange={setTagsText}
          hint={`Comma-separated, ${limits.tagsMin}–${limits.tagsMax} tags.`}
          error={errors.tags}
          required
        />
        <CheckboxGroup name="roles" legend="Roles" options={vocabulary.roles} value={fields.roles} onChange={(value) => set('roles', value)} error={errors.roles} />
        <CheckboxGroup name="stages" legend="Workflow stages" options={vocabulary.stages} value={fields.stages} onChange={(value) => set('stages', value)} error={errors.stages} />
        <CheckboxGroup name="useCases" legend="Use cases" options={vocabulary.useCases} value={fields.useCases} onChange={(value) => set('useCases', value)} error={errors.useCases} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            Review approval
          </Button>
          <Button variant="subtle" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>

      {confirming && (
        <ConfirmDialog title="Approve this submission?" confirmLabel="Approve and create draft" busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void approve()}>
          <p>
            A draft catalogue record <strong className="text-ink">{fields.slug || '—'}</strong> will be created for {submission.name}
            {submission.submitter ? <>, owned by {submission.submitter.email}</> : null}. This decision cannot be undone from here.
          </p>
        </ConfirmDialog>
      )}
    </Panel>
  )
}

export default function ApprovalForm(props: {
  submission: AdminSubmissionDetail
  busy: boolean
  setBusy: (busy: boolean) => void
  onCancel: () => void
  onApproved: (next: AdminSubmissionDetail) => void
  onError: (error: unknown) => void
}) {
  const { state, reload } = useAdminResource((signal) => fetchAdminVocabulary(signal), [])
  return (
    <ResourceView state={state} onRetry={reload} what="vocabulary">
      {(vocabulary) => <Form {...props} vocabulary={vocabulary} />}
    </ResourceView>
  )
}
