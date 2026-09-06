import SpotCard from '@/components/ui/SpotCard'

/*
 * One stat tile in the hero's proof strip.
 *
 * Source: AI Tool Kart Site.dc.html, the `stats` loop below the hero — a spot
 * card with the violet top hairline, a 34px number and an uppercase micro-label.
 *
 * The first design export drew these as bare centred text with no surface; the
 * final one puts each on a card, which is why this component now composes
 * SpotCard rather than rendering a <div>.
 */

interface StatBlockProps {
  value: string
  label: string
}

export default function StatBlock({ value, label }: StatBlockProps) {
  return (
    <SpotCard topHairline className="rounded-card-md px-5 py-[22px]">
      <div className="relative text-[34px] font-bold tracking-[-0.034em] text-[#F6F3FD]">
        {value}
      </div>
      <div className="relative mt-2 text-[11px] tracking-[0.18em] uppercase text-stat-label">
        {label}
      </div>
    </SpotCard>
  )
}
