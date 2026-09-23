import FormField from '@/components/ui/FormField'
import SingleChoiceChips from '@/components/submit/SingleChoiceChips'
import SubmitSectionCard from '@/components/submit/SubmitSectionCard'
import { DESCRIPTION_MAX, TAGLINE_MAX, type SubmitFormState } from '@/types/submit'
import type { ToolCategoryName } from '@/types/tool'

interface SubmitEssentialsSectionProps {
  form: SubmitFormState
  update: (patch: Partial<SubmitFormState>) => void
  categories: ToolCategoryName[]
  pricingModels: string[]
  /**
   * The taxonomy request failed, so there is no vocabulary to pick from. Degrades
   * to free text rather than a permanently empty chip row a required field could
   * never satisfy — the same fallback the assistant's setup pickers use.
   */
  taxonomyFailed: boolean
  /** Validation messages keyed by field name, from a 400's `fields` map. */
  errors: Record<string, string>
}

export default function SubmitEssentialsSection({
  form,
  update,
  categories,
  pricingModels,
  taxonomyFailed,
  errors,
}: SubmitEssentialsSectionProps) {
  return (
    <SubmitSectionCard step={2} title="The essentials" description="What it's called, what it does, and where it fits.">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Product name"
          required
          name="name"
          value={form.name}
          placeholder="Nova Write"
          onChange={(name) => update({ name })}
          error={errors.name}
        />
        <FormField
          label="Tagline"
          required
          name="tagline"
          value={form.tagline}
          maxLength={TAGLINE_MAX}
          placeholder="One line that says what it does"
          onChange={(tagline) => update({ tagline: tagline.slice(0, TAGLINE_MAX) })}
          error={errors.tagline}
        />
      </div>

      <FormField
        label="Description"
        required
        textarea
        rows={6}
        name="description"
        value={form.description}
        maxLength={DESCRIPTION_MAX}
        placeholder="What it does, who it's for, and what makes it worth trying."
        onChange={(description) => update({ description: description.slice(0, DESCRIPTION_MAX) })}
        error={errors.description}
      />

      {taxonomyFailed ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Category"
            required
            name="category"
            value={form.category}
            placeholder="e.g. Writing"
            onChange={(category) => update({ category: category as ToolCategoryName })}
            error={errors.category}
          />
          <FormField
            label="Pricing model"
            required
            name="pricingModel"
            value={form.pricingModel}
            placeholder="e.g. Freemium"
            onChange={(pricingModel) => update({ pricingModel })}
            error={errors.pricingModel}
          />
        </div>
      ) : (
        <>
          <SingleChoiceChips
            label="Category"
            name="category"
            required
            options={categories}
            value={form.category}
            onChange={(category) => update({ category: category as ToolCategoryName })}
            loadingHint="Loading categories…"
            error={errors.category}
          />
          <SingleChoiceChips
            label="Pricing model"
            name="pricingModel"
            required
            options={pricingModels}
            value={form.pricingModel}
            onChange={(pricingModel) => update({ pricingModel })}
            loadingHint="Loading pricing models…"
            error={errors.pricingModel}
          />
        </>
      )}

      <FormField
        label="Price, in your own words"
        name="price"
        value={form.price}
        placeholder="e.g. Free tier + paid plans from $12/mo"
        onChange={(price) => update({ price })}
        error={errors.price}
      />
    </SubmitSectionCard>
  )
}
