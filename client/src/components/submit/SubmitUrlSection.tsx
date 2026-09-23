import FormField from '@/components/ui/FormField'
import SubmitSectionCard from '@/components/submit/SubmitSectionCard'

/*
 * Step 1 — the URL field the rest of the flow builds on.
 */

interface SubmitUrlSectionProps {
  value: string
  onChange: (value: string) => void
  /** A validation message for this field — includes a 409's duplicate-URL message. */
  error?: string
}

export default function SubmitUrlSection({ value, onChange, error }: SubmitUrlSectionProps) {
  return (
    <SubmitSectionCard
      step={1}
      title="Start with your URL"
      description="Your tool's website — the link the catalogue sends people to."
    >
      <FormField
        label="Website URL"
        required
        type="url"
        name="siteUrl"
        value={value}
        placeholder="https://yourtool.com"
        onChange={onChange}
        error={error}
      />
    </SubmitSectionCard>
  )
}
