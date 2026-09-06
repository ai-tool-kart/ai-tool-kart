import mark from '@/assets/mark.png'
import {
  FOOTER_COLUMNS,
  FOOTER_COPYRIGHT,
  FOOTER_SOCIALS,
  FOOTER_TAGLINE,
  type SocialLink,
} from '@/data/footer'

/*
 * Site footer.
 * Source: AI Tool Kart Site.dc.html, <footer id="contact">.
 *
 * New in the final design: the social rail under the tagline — a labelled
 * Discord pill followed by two icon-only squares — and the violet hairline glow
 * along the top border.
 *
 * The column links are inert: they have no destinations in the design. They keep
 * the design's hover colour so the shell looks right, but do not navigate.
 *
 * The design's grid is a fixed `1.6fr repeat(3,1fr)`, which at phone width gives
 * four unreadable columns. Below 900px it stacks the brand block and drops the
 * link columns to two; that is ours, since the source is desktop-only markup.
 */

const SOCIAL_ICONS: Record<SocialLink['id'], React.ReactElement> = {
  discord: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M19.3 5.6A16 16 0 0 0 15.3 4.4l-.3.7a12 12 0 0 1 3.4 1.2 11.4 11.4 0 0 0-9-.9c-.5.2-1 .4-1.4.6a12 12 0 0 1 3.4-1.2l-.3-.7A16 16 0 0 0 4.7 5.6C2.6 8.9 2 12.4 2.3 15.9a15.7 15.7 0 0 0 4.8 2.4l.6-1a10.4 10.4 0 0 1-1.7-.8l.4-.3a11.6 11.6 0 0 0 9.9 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a15.7 15.7 0 0 0 4.8-2.4c.4-3.9-.6-7.4-2.6-10.3ZM9 13.9c-.9 0-1.6-.8-1.6-1.8S8.1 10.3 9 10.3s1.6.8 1.6 1.8-.7 1.8-1.6 1.8Zm6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[15px] w-[15px]">
      <path d="M17.5 3h3.1l-6.8 7.8L21.5 21h-5.6l-4.4-5.7L6.4 21H3.3l7.1-8.1L2.9 3h5.7l4.1 5.4L17.5 3Zm-1.1 16h1.7L7.3 4.7H5.5L16.4 19Z" />
    </svg>
  ),
  instagram: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-4 w-4"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.9" cy="7.1" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
}

const SOCIAL_BASE =
  'inline-flex h-10 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-[background-color,border-color,color,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[2px]'

export default function Footer() {
  return (
    <footer
      id="contact"
      className="mx-auto mt-[132px] max-w-site border-t border-white/[0.14] px-8 pt-14 pb-16 shadow-[0_-1px_0_rgba(167,139,250,0.14)]"
    >
      <div className="grid grid-cols-2 gap-10 min-[900px]:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div className="col-span-2 min-[900px]:col-span-1">
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

          <div className="mt-[22px] flex flex-wrap items-center gap-[10px]">
            {FOOTER_SOCIALS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                title={social.label}
                aria-label={social.showLabel ? undefined : social.label}
                className={
                  social.showLabel
                    ? `${SOCIAL_BASE} gap-[9px] border-[rgba(178,150,255,0.34)] bg-[rgba(124,90,246,0.16)] px-[15px] text-[13px] font-semibold tracking-[-0.006em] text-[#D9CEFF] hover:border-[rgba(196,168,255,0.6)] hover:bg-[rgba(124,90,246,0.28)] hover:text-white`
                    : `${SOCIAL_BASE} w-10 border-white/[0.09] bg-white/[0.032] text-muted-soft hover:border-[rgba(178,150,255,0.45)] hover:bg-[rgba(139,92,246,0.16)] hover:text-[#F1EAFF]`
                }
              >
                {SOCIAL_ICONS[social.id]}
                {social.showLabel && 'Discord'}
              </a>
            ))}
          </div>

          <div className="mt-[22px] text-[13px] text-subtle-dim">{FOOTER_COPYRIGHT}</div>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="text-[12px] tracking-[0.16em] uppercase text-footer-title">
              {col.title}
            </div>
            <div className="mt-4 flex flex-col gap-[10px]">
              {col.links.map((link) => (
                <span
                  key={link}
                  className="text-[14px] text-footer-link transition-colors duration-200 hover:text-footer-link-hover"
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
