import AddToKartSection from '@/pages/home/sections/AddToKartSection'
import AiForYourWorkSection from '@/pages/home/sections/AiForYourWorkSection'
import BlogInsightsSection from '@/pages/home/sections/BlogInsightsSection'
import CommunitySection from '@/pages/home/sections/CommunitySection'
import FeaturedToolsSection from '@/pages/home/sections/FeaturedToolsSection'
import Hero from '@/pages/home/sections/Hero'
import HowPeopleAreUsingAISection from '@/pages/home/sections/HowPeopleAreUsingAISection'
import PopularWaysSection from '@/pages/home/sections/PopularWaysSection'
import SavingsSection from '@/pages/home/sections/SavingsSection'
import RecentlyAddedToolsSection from '@/pages/home/sections/RecentlyAddedToolsSection'
import { useHomeAssistant } from '@/pages/home/useHomeAssistant'

/*
 * Composition, and the one thing the sections have to share.
 *
 * Section order matches the handoff exactly — all ten of its home sections, in
 * its order, and nothing else. Four sections built from the FIRST design export
 * used to sit between Community and the closing CTA (Trending, Categories, the
 * Compare teaser and FAQ); the final design has no equivalent of any of them on
 * Home, so they were removed rather than restyled. Their components and data
 * mostly survive because /kitchen-sink and Browse still use them.
 *
 * The page holds no other state: the assistant session lives here only because
 * two sections are surfaces onto the same conversation — the hero's stage and
 * the setup cards below it — and a second session would silently split the
 * thread. See pages/home/useHomeAssistant.ts.
 */

export default function HomePage() {
  const assistant = useHomeAssistant()

  return (
    <>
      <Hero assistant={assistant} />
      <PopularWaysSection />
      <AiForYourWorkSection onAskAssistant={assistant.ask} />
      <FeaturedToolsSection />
      <RecentlyAddedToolsSection />
      <HowPeopleAreUsingAISection />
      <SavingsSection />
      <BlogInsightsSection />
      <CommunitySection />
      <AddToKartSection />
    </>
  )
}
