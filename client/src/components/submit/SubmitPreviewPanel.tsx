import CatalogueToolCard from '@/components/catalogue/CatalogueToolCard'
import SpotCard from '@/components/ui/SpotCard'
import { toPreviewTool, type SubmitFormState } from '@/types/submit'

/*
 * The sticky right rail: a live render of the EXACT card Browse uses, built
 * from a synthesized `Tool` (types/submit.ts#toPreviewTool) — not a lookalike
 * that could drift from the real one — plus a small checklist so the visitor
 * can see what's still missing without scrolling back up through four sections.
 */

interface SubmitPreviewPanelProps {
  form: SubmitFormState
}

const CHECKLIST: ReadonlyArray<{ label: string; done: (form: SubmitFormState) => boolean }> = [
  { label: 'Website added', done: (form) => form.siteUrl.trim() !== '' },
  {
    label: 'Essentials complete',
    done: (form) => form.name.trim() !== '' && form.tagline.trim() !== '' && form.description.trim() !== '',
  },
  { label: 'Category & pricing set', done: (form) => form.category !== '' && form.pricingModel !== '' },
  { label: 'Launch week picked', done: (form) => form.launchWeekId !== '' },
]

export default function SubmitPreviewPanel({ form }: SubmitPreviewPanelProps) {
  const hasContent = form.name.trim() !== ''

  return (
    <div className="flex flex-col gap-5 lg:sticky lg:top-[100px]">
      <div>
        <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">Live preview</p>
        <p className="mt-[6px] text-[13px] leading-[1.55] text-muted-dim">
          This is exactly how your card will look in the catalogue.
        </p>
      </div>

      {hasContent ? (
        <CatalogueToolCard tool={toPreviewTool(form)} index={0} onOpen={() => {}} />
      ) : (
        <SpotCard className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-panel p-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/[0.16] text-subtle-dim">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
              <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
              <path d="M3.5 15.5 8 11l3 3 4-4.5 5.5 6" />
            </svg>
          </span>
          <p className="max-w-[26ch] text-[13px] leading-[1.6] text-muted-dim">
            Fill in the essentials and your card preview appears here.
          </p>
        </SpotCard>
      )}

      <SpotCard className="rounded-panel p-5">
        <div className="relative flex flex-col gap-[10px]">
          <span className="text-[11.5px] tracking-[0.14em] text-subtle uppercase">Before you launch</span>
          {CHECKLIST.map(({ label, done }) => {
            const complete = done(form)
            return (
              <div key={label} className="flex items-center gap-[10px]">
                <span
                  className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border transition-colors duration-300 ${
                    complete ? 'border-accent bg-accent-wash-strong text-accent' : 'border-white/[0.16] text-transparent'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[10px] w-[10px]">
                    <path d="m4 12.5 5 5L20 6" />
                  </svg>
                </span>
                <span className={`text-[13.5px] ${complete ? 'text-ink' : 'text-muted-dim'}`}>{label}</span>
              </div>
            )
          })}
        </div>
      </SpotCard>
    </div>
  )
}
