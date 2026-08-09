import Button from '@/components/ui/Button'

/** Shown when no tool matches the active filters. */

interface EmptyStateProps {
  onReset: () => void
}

export default function EmptyState({ onReset }: EmptyStateProps) {
  return (
    <div className="rounded-card-lg border border-dashed border-white/[0.13] bg-white/[0.055] px-6 py-16 text-center">
      <div className="text-[20px] font-semibold text-ink">Nothing matches those filters</div>
      <div className="mt-[10px] text-[14.5px] text-muted">
        Loosen the rating, or clear the category.
      </div>
      <div className="mt-5">
        <Button variant="gradient" onClick={onReset} className="px-[22px] py-3 text-[14px]">
          Reset filters
        </Button>
      </div>
    </div>
  )
}
