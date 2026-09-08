import AiForYourWorkSection from '@/pages/home/sections/AiForYourWorkSection'
import CategoriesSection from '@/pages/home/sections/CategoriesSection'
import CompareTeaser from '@/pages/home/sections/CompareTeaser'
import CtaBanner from '@/pages/home/sections/CtaBanner'
import FaqSection from '@/pages/home/sections/FaqSection'
import FeaturedSection from '@/pages/home/sections/FeaturedSection'
import Hero from '@/pages/home/sections/Hero'
import PopularWaysSection from '@/pages/home/sections/PopularWaysSection'
import TrendingSection from '@/pages/home/sections/TrendingSection'
import { useHomeAssistant } from '@/pages/home/useHomeAssistant'

/*
 * Composition, and the one thing the sections have to share.
 *
 * Section order matches the handoff exactly. The page holds no other state: the
 * assistant session lives here only because two sections are surfaces onto the
 * same conversation — the hero's stage and the setup cards below it — and a
 * second session would silently split the thread. See pages/home/useHomeAssistant.ts.
 */

export default function HomePage() {
  const assistant = useHomeAssistant()

  return (
    <>
      <Hero assistant={assistant} />
      <PopularWaysSection />
      <AiForYourWorkSection onAskAssistant={assistant.ask} />
      <TrendingSection />
      <FeaturedSection />
      <CategoriesSection />
      <CompareTeaser />
      <FaqSection />
      <CtaBanner />
    </>
  )
}
