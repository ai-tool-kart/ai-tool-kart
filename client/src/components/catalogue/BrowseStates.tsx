/*
 * The two non-result states the results column can be in.
 *
 * The design has only "Nothing matches those filters" — its catalogue was an
 * array in the bundle and could not fail. Against a real API, "no tools came
 * back" has two very different causes and they must never look alike: an empty
 * result is an answer about the catalogue, a failed request is an answer about
 * the network. Rendering a failure as an empty catalogue tells the reader
 * something false about the product.
 *
 * So the empty state is the design's, verbatim, and the error state is the same
 * dashed-panel shape carrying a different message and a Retry rather than a
 * Reset. They share `StatePanel` so they cannot drift apart.
 */

import type { ReactNode } from 'react'

const PANEL =
  'rounded-panel border border-dashed border-white/[0.13] bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.016)_100%)] px-6 py-16 text-center'

const ACTION =
  'mt-5 inline-flex h-[46px] cursor-pointer items-center gap-2 rounded-pill border border-white/[0.22] bg-[linear-gradient(180deg,#B08CFF_0%,#8858F2_48%,#6A32DC_100%)] px-[22px] text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_16px_32px_-20px_rgba(116,80,244,0.95)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px'

/**
 * The dashed state panel both states below are built from. Exported so other
 * list pages (automations) render their empty and error states in the same
 * shape rather than a lookalike.
 */
export function StatePanel({
  title,
  detail,
  action,
  role,
}: {
  title: string
  detail: ReactNode
  action?: { label: string; onClick: () => void }
  role?: 'alert' | 'status'
}) {
  return (
    <div className={PANEL} {...(role ? { role } : {})}>
      <p className="text-[20px] font-semibold text-ink">{title}</p>
      <p className="mt-[10px] text-[14.5px] leading-[1.55] text-muted-dim">{detail}</p>
      {action && (
        <button type="button" onClick={action.onClick} className={ACTION}>
          {action.label}
        </button>
      )}
    </div>
  )
}

/** The catalogue answered; nothing matched. The design's copy, unchanged. */
export function BrowseEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <StatePanel
      role="status"
      title="Nothing matches those filters"
      detail="Try a broader search, or clear the category."
      action={{ label: 'Reset filters', onClick: onReset }}
    />
  )
}

/**
 * The request failed.
 *
 * `message` is the server's own wording when it sent one — it is written for a
 * reader and usually says something actionable, like which host was
 * unreachable — and a generic line otherwise.
 */
export function BrowseErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <StatePanel
      role="alert"
      title="The catalogue could not be loaded"
      detail={message}
      action={{ label: 'Try again', onClick: onRetry }}
    />
  )
}
