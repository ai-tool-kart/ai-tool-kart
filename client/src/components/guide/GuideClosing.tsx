import { Link } from 'react-router-dom'
import { ArrowIcon, H2, WINDOW, WindowRim } from '@/components/guide/guideStyles'
import type { WorkflowGuide } from '@/types/guide'

/*
 * The closing call to action — the article's last word, and one clear next
 * move: back up into the workflow. The second link is the way onward, to
 * more guides like this one.
 *
 * Every guide has one. The copy is the editor's `closing` when written, else
 * the normalization layer's plain pointer to step 1 (utils/workflowGuide.ts).
 */

export default function GuideClosing({ guide }: { guide: WorkflowGuide }) {
  return (
    <section aria-labelledby="closing-title" className={`${WINDOW} px-6 py-10 text-center sm:px-10 sm:py-12`}>
      <WindowRim />
      <h2 id="closing-title" className={`${H2} mx-auto max-w-[640px]`}>
        {guide.closing.title}
      </h2>
      <p className="mx-auto mt-4 max-w-[560px] text-[15.5px] leading-[1.65] text-pretty text-[#C0B9D6]">
        {guide.closing.body}
      </p>
      <div className="mt-7 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <a
          href="#workflow"
          className="group inline-flex items-center gap-2 rounded-pill border border-white/[0.16] bg-[image:var(--gradient-cta)] px-[22px] py-[12px] text-[14.5px] font-semibold text-white shadow-button transition-[box-shadow] duration-300 hover:text-white hover:shadow-button-hover"
        >
          Start the workflow
          <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-[3px]" />
        </a>
        <Link
          to={`/automations?niche=${encodeURIComponent(guide.niche)}`}
          className="text-[14px] font-medium text-muted-soft underline-offset-4 hover:text-ink hover:underline"
        >
          More {guide.niche} guides
        </Link>
      </div>
    </section>
  )
}
