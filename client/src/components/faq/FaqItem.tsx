import type { Faq } from '@/types/content'

/*
 * One accordion row. Open state is controlled by the parent so only one answer
 * is expanded at a time, matching the design's single `openFaq` index.
 */

interface FaqItemProps {
  faq: Faq
  open: boolean
  onToggle: () => void
}

export default function FaqItem({ faq, open, onToggle }: FaqItemProps) {
  return (
    <div
      data-reveal="stagger"
      className="bg-row-body px-3 py-[22px] transition-colors duration-[250ms] hover:bg-row-head"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-5 text-left"
      >
        <span className="text-[18px] font-semibold text-ink">{faq.q}</span>
        <span
          aria-hidden="true"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-hairline-strong bg-row-body text-[15px] text-accent"
        >
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="mt-[14px] max-w-[640px] text-[15px] leading-[1.65] text-pretty text-muted [animation:akRise_.35s_ease_both]">
          {faq.a}
        </div>
      )}
    </div>
  )
}
