/*
 * Shown when WordPress answers successfully but has no published posts.
 * Matches the dashed-border empty treatment already used on Browse.
 */

export default function BlogEmptyState() {
  return (
    <div className="rounded-card-lg border border-dashed border-white/[0.13] bg-white/[0.035] px-6 py-16 text-center">
      <div className="text-[20px] font-semibold text-ink">The journal is warming up</div>
      <p className="mx-auto mt-[10px] max-w-[46ch] text-[14.5px] leading-[1.6] text-pretty text-muted">
        No stories are published yet. Our editors are testing — the first pieces land here as
        soon as they are.
      </p>
    </div>
  )
}
