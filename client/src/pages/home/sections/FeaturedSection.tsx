import { useNavigate } from 'react-router-dom'
import Section from '@/components/layout/Section'
import ToolGrid from '@/components/tools/ToolGrid'
import Button from '@/components/ui/Button'
import SectionHeading from '@/components/ui/SectionHeading'
import { TOOLS } from '@/data/tools'

/** Featured tools — the first six of the catalog, as in the design. */

const FEATURED_COUNT = 6

export default function FeaturedSection() {
  const navigate = useNavigate()

  return (
    <Section>
      <div data-reveal="0">
        <SectionHeading
          eyebrow="Tested by our editors"
          title="Featured tools"
          action={
            <Button variant="outline" to="/browse">
              Browse all 2,412
            </Button>
          }
        />
      </div>
      <div className="mt-[34px]">
        <ToolGrid
          tools={TOOLS.slice(0, FEATURED_COUNT)}
          variant="featured"
          onToolClick={() => navigate('/browse')}
        />
      </div>
    </Section>
  )
}
