import { useState } from 'react'
import ComparisonTable from '@/components/compare/ComparisonTable'
import CategoryGrid from '@/components/categories/CategoryGrid'
import FaqAccordion from '@/components/faq/FaqAccordion'
import BillingToggle from '@/components/pricing/BillingToggle'
import FeatureMatrix from '@/components/pricing/FeatureMatrix'
import PricingGrid from '@/components/pricing/PricingGrid'
import ToolCard from '@/components/tools/ToolCard'
import ToolGrid from '@/components/tools/ToolGrid'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Chip from '@/components/ui/Chip'
import FormField from '@/components/ui/FormField'
import RangeSlider from '@/components/ui/RangeSlider'
import Select from '@/components/ui/Select'
import SectionHeading from '@/components/ui/SectionHeading'
import StatBlock from '@/components/ui/StatBlock'
import { CATEGORIES } from '@/data/categories'
import { COMPARE_FULL_ROWS, DEFAULT_COMPARE_SELECTION } from '@/data/comparisonRows'
import { FAQS } from '@/data/faqs'
import { PRICE_FILTERS } from '@/data/filters'
import { FEATURE_MATRIX_ROWS, PRICING_TIERS, TIER_NAMES } from '@/data/pricing'
import { HERO_STATS } from '@/data/stats'
import { TOOLS } from '@/data/tools'
import type { BillingPeriod } from '@/types/pricing'
import type { SortOption } from '@/types/tool'
import { findToolByName } from '@/utils/filterTools'

/*
 * TEMPORARY — Phase 3 component verification surface, reachable at /kitchen-sink.
 *
 * Renders every reusable component with representative props so it can be
 * compared side by side against the Claude Design handoff. Removed in Phase 11.
 */

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[12px] tracking-[0.22em] uppercase text-subtle">{title}</h2>
      {children}
    </section>
  )
}

/* v1 display labels, kept only so the Select demo below has options to show. */
const DEMO_SORT_OPTIONS = ['Most popular', 'Highest rated', 'Most reviewed', 'A–Z']

export default function KitchenSinkPage() {
  const [billing, setBilling] = useState<BillingPeriod>('annual')
  const [sort, setSort] = useState(DEMO_SORT_OPTIONS[0])
  const [price, setPrice] = useState(PRICE_FILTERS[0])
  const [rating, setRating] = useState(4)
  const [name, setName] = useState('')

  const compareTools = DEFAULT_COMPARE_SELECTION.map((n) => findToolByName(TOOLS, n)).filter(
    (t) => t !== undefined,
  )

  return (
    <div className="mx-auto flex max-w-site flex-col gap-16 px-8 pt-16">
      <SectionHeading eyebrow="Phase 3" title="Component kitchen sink" as="h1" />

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="gradient" magnetic>
            Submit Your Tool
          </Button>
          <Button variant="outline">Browse all 2,412</Button>
          <Button variant="ghost">Compare</Button>
        </div>
      </Block>

      <Block title="Badges & chips">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="editorial">Editors&apos; pick</Badge>
          <Badge variant="accent">Most popular</Badge>
          <Badge variant="trend">+142%</Badge>
          <Chip>Long-form</Chip>
          {PRICE_FILTERS.slice(0, 3).map((p) => (
            <Chip key={p} variant="filter" active={price === p} onClick={() => setPrice(p)}>
              {p}
            </Chip>
          ))}
        </div>
      </Block>

      <Block title="Stats">
        <div className="grid grid-cols-4 gap-6">
          {HERO_STATS.map((s) => (
            <StatBlock key={s.label} value={s.value} label={s.label} />
          ))}
        </div>
      </Block>

      <Block title="Form controls">
        <div className="flex flex-wrap items-end gap-6">
          <Select value={sort} onChange={(v) => setSort(v as SortOption)} options={DEMO_SORT_OPTIONS} />
          <div className="w-[260px]">
            <RangeSlider value={rating} onChange={setRating} />
          </div>
          <div className="w-[320px]">
            <FormField label="Tool name" value={name} onChange={setName} placeholder="Nova Write" />
          </div>
        </div>
      </Block>

      <Block title="Tool card — featured (3-up)">
        <ToolGrid tools={TOOLS.slice(0, 3)} variant="featured" />
      </Block>

      <Block title="Tool card — browse (2-up)">
        <ToolGrid tools={TOOLS.slice(3, 5)} variant="browse" onCompare={() => {}} />
      </Block>

      <Block title="Tool card — trending">
        <div className="flex gap-[18px]">
          {TOOLS.slice(0, 3).map((t) => (
            <ToolCard key={t.id} tool={t} variant="trending" />
          ))}
        </div>
      </Block>

      <Block title="Category grid">
        <CategoryGrid categories={CATEGORIES} />
      </Block>

      <Block title="Pricing">
        <BillingToggle value={billing} onChange={setBilling} />
        <PricingGrid tiers={PRICING_TIERS} billing={billing} />
      </Block>

      <Block title="Feature matrix">
        <FeatureMatrix tierNames={TIER_NAMES} rows={FEATURE_MATRIX_ROWS} />
      </Block>

      <Block title="Comparison table">
        <ComparisonTable tools={compareTools} rows={COMPARE_FULL_ROWS} />
      </Block>

      <Block title="FAQ">
        <FaqAccordion faqs={FAQS} />
      </Block>
    </div>
  )
}
