import Button from '@/components/ui/Button'

/*
 * Restrained failure state for the blog views.
 *
 * The CMS being unreachable is a normal condition in local development (the
 * LocalWP site is simply stopped), so this reads as an interruption rather than
 * a crash — and the rest of the site keeps working around it.
 */

interface BlogErrorStateProps {
  message: string
  onRetry: () => void
}

export default function BlogErrorState({ message, onRetry }: BlogErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-card-lg border border-dashed border-white/[0.13] bg-white/[0.035] px-6 py-16 text-center"
    >
      <div className="text-[20px] font-semibold text-ink">The journal is unavailable</div>
      <p className="mx-auto mt-[10px] max-w-[52ch] text-[14.5px] leading-[1.6] text-pretty text-muted">
        {message}
      </p>
      <div className="mt-5">
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}
