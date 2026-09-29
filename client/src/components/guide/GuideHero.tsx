import { Link } from 'react-router-dom'
import { META_PILL } from '@/components/automations/labels'
import { ArrowIcon, EYEBROW, WINDOW, WindowRim } from '@/components/guide/guideStyles'
import type { WorkflowGuide } from '@/types/guide'

/*
 * The guide's opening: breadcrumb, the task as the page's one H1, a lede, and
 * beside it the "workflow snapshot" window — Goal → Steps → Tools in one
 * glance, where the reference design put a hero image. There is no image for
 * any of these records, and a stock one would promise a result the guide
 * cannot show; the snapshot is the real thing the page offers.
 *
 * The search-term chips are the record's intent labels — how else people ask
 * for this task — each a search on the automations page for guides like it.
 */

/** "2026-09-28" → "Sep 28, 2026" — in UTC, so the prerender and the browser agree. */
function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function niche(guide: WorkflowGuide): string {
  return `/automations?niche=${encodeURIComponent(guide.niche)}`
}

function Breadcrumb({ guide }: { guide: WorkflowGuide }) {
  const crumb = 'text-subtle-soft transition-colors duration-200 hover:text-ink'
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-[13px]">
        <li>
          <Link to="/" className={crumb}>
            Home
          </Link>
        </li>
        <li aria-hidden="true" className="text-subtle-dim">
          /
        </li>
        <li>
          <Link to="/automations" className={crumb}>
            Automations
          </Link>
        </li>
        <li aria-hidden="true" className="text-subtle-dim">
          /
        </li>
        <li>
          <Link to={niche(guide)} className={crumb}>
            {guide.niche}
          </Link>
        </li>
        <li aria-hidden="true" className="hidden text-subtle-dim sm:block">
          /
        </li>
        <li aria-current="page" className="hidden max-w-[280px] truncate text-subtle-dim sm:block">
          {guide.title}
        </li>
      </ol>
    </nav>
  )
}

function Snapshot({ guide }: { guide: WorkflowGuide }) {
  return (
    <aside aria-labelledby="snapshot-title" className={`${WINDOW} flex flex-col gap-5 p-5 sm:p-6`}>
      <WindowRim />
      <div className="flex items-center justify-between gap-3">
        <p id="snapshot-title" className={EYEBROW}>
          Workflow snapshot
        </p>
        <span className={META_PILL}>{guide.steps.length} steps</span>
      </div>

      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[#A39CBC] uppercase">Built for</p>
        <p className="mt-[6px] text-[14.5px] leading-[1.5] text-pretty text-[#E4DEF4]">{guide.persona}</p>
      </div>

      <ol className="flex list-none flex-col p-0">
        {guide.steps.map((step, index) => (
          <li key={step.id} className="flex gap-3">
            <div aria-hidden="true" className="flex w-[22px] flex-none flex-col items-center">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border border-[rgba(178,150,255,0.32)] bg-[rgba(124,88,244,0.16)] text-[11px] font-bold text-[#C8AEFF] tabular-nums">
                {step.number}
              </span>
              {index < guide.steps.length - 1 && (
                <span className="my-1 w-px flex-auto bg-[linear-gradient(180deg,rgba(178,150,255,0.4),rgba(178,150,255,0.08))]" />
              )}
            </div>
            <p className="pb-3 text-[14px] leading-[22px] font-medium text-[#DCD5EE]">
              {step.title}
              {step.tools.length > 0 && (
                <span className="font-normal text-[#8A83A6]"> · {step.tools.map((tool) => tool.name).join(', ')}</span>
              )}
            </p>
          </li>
        ))}
      </ol>

      <dl className="grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4 text-[13px]">
        <div>
          <dt className="text-[11px] font-semibold tracking-[0.14em] text-[#A39CBC] uppercase">Setup</dt>
          <dd className="mt-1 text-[#DCD5EE]">{guide.setupLabel}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[0.14em] text-[#A39CBC] uppercase">
            {guide.tools.length === 1 ? 'Tool' : 'Tools'}
          </dt>
          <dd className="mt-1 text-[#DCD5EE]">
            {guide.tools.map((tool) => tool.name).join(', ')}
            {guide.priceLabel && <span className="text-[#8A83A6]"> · {guide.priceLabel}</span>}
          </dd>
        </div>
      </dl>

      <a
        href="#workflow"
        className="group inline-flex items-center justify-center gap-2 rounded-pill border border-white/[0.16] bg-[image:var(--gradient-cta)] px-[18px] py-[11px] text-[14px] font-semibold text-white shadow-button transition-[box-shadow] duration-300 hover:text-white hover:shadow-button-hover"
      >
        Start the workflow
        <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-[3px]" />
      </a>
    </aside>
  )
}

export default function GuideHero({ guide }: { guide: WorkflowGuide }) {
  return (
    <header className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-14">
      <div className="min-w-0">
        <Breadcrumb guide={guide} />

        <p className="mt-8">
          <Link to={niche(guide)} className={`${EYEBROW} underline-offset-4 hover:underline`}>
            {guide.niche} · AI workflow guide
          </Link>
        </p>
        <h1 className="mt-4 text-[clamp(30px,4.4vw,50px)] leading-[1.08] font-bold tracking-[-0.038em] text-balance text-ink-bright">
          {guide.title}
        </h1>
        <p className="mt-5 max-w-[620px] text-[17px] leading-[1.6] tracking-[-0.01em] text-pretty text-[#C0B9D6]">
          {guide.lede}
        </p>

        {/* Dot separators from sm up; on a phone the line wraps, and a dot would dangle at a line end. */}
        <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-subtle-soft sm:gap-x-3">
          <span>By AI Tool Kart</span>
          {guide.updatedAt && (
            <>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span>
                Updated <time dateTime={guide.updatedAt}>{formatDate(guide.updatedAt)}</time>
              </span>
            </>
          )}
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span>{guide.readingMinutes} min read</span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span>{guide.steps.length} steps</span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span>{guide.setupLabel}</span>
        </p>

        {guide.searchTerms.length > 0 && (
          <div className="mt-7">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#A39CBC] uppercase">Also searched as</p>
            <ul className="mt-3 flex list-none flex-wrap gap-2 p-0">
              {guide.searchTerms.map((term) => (
                <li key={term}>
                  <Link
                    to={`/automations?q=${encodeURIComponent(term)}`}
                    className="inline-block rounded-pill border border-white/[0.09] bg-white/[0.03] px-3 py-[6px] text-[12.5px] text-muted-soft transition-[border-color,color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash hover:text-accent"
                  >
                    {term}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Snapshot guide={guide} />
    </header>
  )
}
