import ComparisonTable from '@/components/compare/ComparisonTable'
import Section from '@/components/layout/Section'
import Button from '@/components/ui/Button'
import SectionHeading from '@/components/ui/SectionHeading'
import { COMPARE_TEASER_ROWS, DEFAULT_COMPARE_SELECTION } from '@/data/comparisonRows'
import { TOOLS } from '@/data/tools'
import type { Tool } from '@/types/tool'
import { findToolByName } from '@/utils/filterTools'

/*
 * Comparison teaser panel — a static 5-row preview of the Compare page using
 * the design's default three tools.
 */

const TEASER_TOOLS: Tool[] = DEFAULT_COMPARE_SELECTION.map((name) =>
  findToolByName(TOOLS, name),
).filter((tool): tool is Tool => tool !== undefined)

export default function CompareTeaser() {
  return (
    <Section>
      <div
        data-reveal="0"
        className="rounded-panel-lg border border-white/[0.08] bg-[linear-gradient(120deg,rgba(139,92,246,0.13),rgba(255,255,255,0.028)_52%,rgba(56,110,240,0.11))] p-10"
      >
        <SectionHeading
          eyebrow="Side by side"
          title="Stop reading six pricing pages"
          size="panel"
          action={
            <Button variant="light" to="/compare" className="px-6 py-[13px] text-[14.5px]">
              Open the comparison tool
            </Button>
          }
        />
        <div className="mt-[30px]">
          <ComparisonTable
            density="teaser"
            headLabel="Feature"
            tools={TEASER_TOOLS}
            rows={COMPARE_TEASER_ROWS}
          />
        </div>
      </div>
    </Section>
  )
}
