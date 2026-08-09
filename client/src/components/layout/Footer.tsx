import mark from '@/assets/mark.png'
import { FOOTER_COLUMNS, FOOTER_COPYRIGHT, FOOTER_TAGLINE } from '@/data/footer'

/*
 * Site footer.
 * Source: AI Tool Kart Site.dc.html, <footer id="contact">.
 *
 * The link labels are inert — they have no destinations in the design. They keep
 * the design's hover colour so the shell looks right, but do not navigate.
 */

export default function Footer() {
  return (
    <footer
      id="contact"
      className="mx-auto mt-[120px] max-w-site border-t border-hairline px-8 pt-11 pb-14"
    >
      <div className="grid grid-cols-[1.6fr_repeat(3,1fr)] gap-10">
        <div>
          <div className="flex items-center gap-[10px]">
            <img
              src={mark}
              alt=""
              className="block h-[27px] w-[26px] opacity-[0.85] brightness-0 invert"
            />
            <span className="text-[19px] font-bold tracking-[-0.025em] text-ink">
              ai tool kart
            </span>
          </div>
          <p className="mt-4 max-w-[320px] text-[14px] leading-[1.6] text-pretty text-muted-dim">
            {FOOTER_TAGLINE}
          </p>
          <div className="mt-[18px] text-[13px] text-subtle-dim">{FOOTER_COPYRIGHT}</div>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="text-[12.5px] tracking-[0.1em] uppercase text-subtle">
              {col.title}
            </div>
            <div className="mt-4 flex flex-col gap-[10px]">
              {col.links.map((link) => (
                <span
                  key={link}
                  className="text-[14px] text-muted-soft transition-colors duration-200 hover:text-accent"
                >
                  {link}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  )
}
