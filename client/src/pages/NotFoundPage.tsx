import Section from '@/components/layout/Section'
import Button from '@/components/ui/Button'

/*
 * Catch-all for unmatched URLs.
 *
 * Added when /pricing was retired: without it an unknown path matched no route
 * at all and rendered a blank document — not even the shell — so an old bookmark
 * looked like an outage. Now it lands inside the normal shell with a way back.
 */

export default function NotFoundPage() {
  return (
    <Section spacing="sub" className="pb-4">
      <div className="mx-auto max-w-[560px] py-16 text-center">
        <div className="text-[11.5px] tracking-[0.2em] uppercase text-accent">404</div>
        <h1 className="mt-3 text-[clamp(30px,4.4vw,44px)] leading-[1.1] font-bold tracking-[-0.035em] text-balance text-ink">
          This page has moved on
        </h1>
        <p className="mt-4 text-[16px] leading-[1.65] text-pretty text-body">
          The page you were looking for isn't here. The catalog and the journal are.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button variant="gradient" to="/browse">
            Browse tools
          </Button>
          <Button variant="outline" to="/blog">
            Read the blog
          </Button>
        </div>
      </div>
    </Section>
  )
}
