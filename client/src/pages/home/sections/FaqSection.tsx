import FaqAccordion from '@/components/faq/FaqAccordion'
import Section from '@/components/layout/Section'
import { FAQS } from '@/data/faqs'

/** FAQ — fixed 380px intro column beside the accordion. */

export default function FaqSection() {
  return (
    <Section>
      <div className="grid grid-cols-[380px_1fr] items-start gap-14">
        <div>
          <div className="text-[11.5px] tracking-[0.2em] uppercase text-accent">FAQ</div>
          <h2 className="mt-3 text-[40px] font-bold tracking-[-0.032em] text-balance text-ink">
            Questions we get every week
          </h2>
          <p className="mt-[18px] text-[15px] leading-[1.6] text-muted">
            Still stuck? <a href="#contact">Ask the editors</a> — a human answers within a day.
          </p>
        </div>
        <FaqAccordion faqs={FAQS} />
      </div>
    </Section>
  )
}
