import { useState } from 'react'
import FaqItem from '@/components/faq/FaqItem'
import type { Faq } from '@/types/content'

/*
 * FAQ list. The 1px gap plus hairline background reproduces the design's
 * divider treatment. First item starts open, as in the source (openFaq: 0).
 */

interface FaqAccordionProps {
  faqs: Faq[]
  defaultOpenIndex?: number
}

export default function FaqAccordion({ faqs, defaultOpenIndex = 0 }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState(defaultOpenIndex)

  return (
    <div className="flex flex-col gap-px border-t border-b border-hairline bg-hairline">
      {faqs.map((faq, i) => (
        <FaqItem
          key={faq.q}
          faq={faq}
          open={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
        />
      ))}
    </div>
  )
}
