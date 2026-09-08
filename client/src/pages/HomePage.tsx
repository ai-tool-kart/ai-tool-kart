import CategoriesSection from '@/pages/home/sections/CategoriesSection'
import CompareTeaser from '@/pages/home/sections/CompareTeaser'
import CtaBanner from '@/pages/home/sections/CtaBanner'
import FaqSection from '@/pages/home/sections/FaqSection'
import FeaturedSection from '@/pages/home/sections/FeaturedSection'
import Hero from '@/pages/home/sections/Hero'
import PopularWaysSection from '@/pages/home/sections/PopularWaysSection'
import TrendingSection from '@/pages/home/sections/TrendingSection'

/* Composition only — section order matches the handoff exactly. */

export default function HomePage() {
  return (
    <>
      <Hero />
      <PopularWaysSection />
      <TrendingSection />
      <FeaturedSection />
      <CategoriesSection />
      <CompareTeaser />
      <FaqSection />
      <CtaBanner />
    </>
  )
}
