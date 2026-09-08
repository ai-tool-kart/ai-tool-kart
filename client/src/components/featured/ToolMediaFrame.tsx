import { ImageSlotIcon } from '@/components/featured/icons'

/*
 * A tool's picture, or the honest absence of one.
 *
 * Every image on the editors' desk goes through here: the 16:9 banner, the 96px
 * mark, and the square on each small card. It takes a resolved URL — see
 * utils/toolMedia.ts — and draws it, or draws the fallback its caller asks for.
 *
 * ── Why two fallbacks ────────────────────────────────────────────────────────
 *
 * `monogram` is used wherever the catalogue already has a real answer. A tool's
 * `mono` is its two-letter identity across Browse, the assistant and the setup
 * stacks, so a logo slot with no logo shows the same mark the rest of the site
 * shows rather than an apology. That is a fallback, not a placeholder.
 *
 * `slot` is used only for the wide banner, where the catalogue has nothing at
 * all and no substitute would be truthful. It reproduces the handoff's
 * `image-slot` empty state — a dashed ring, the image glyph, a caption — which
 * reads unmistakably as "a picture goes here", holds the exact aspect ratio the
 * filled state will occupy, and cannot be mistaken for a broken image. No stock
 * photography and no generated screenshot: this section's whole job is telling a
 * reader what a tool really looks like, and an invented picture would be the one
 * lie that matters.
 *
 * When `src` arrives the frame is unchanged — same box, same radius — and the
 * image simply covers it, so nothing reflows on the day media lands.
 */

interface ToolMediaFrameProps {
  /** Already resolved. `undefined` is normal today. */
  src?: string
  /** Alt text when `src` is present; also the slot caption. */
  name: string
  /** The catalogue's two-letter mark, for the monogram fallback. */
  mono?: string
  fallback: 'monogram' | 'slot'
  /** Box, radius, border and shadow — they differ per slot in the design. */
  className?: string
  /** Sizes the monogram or the slot glyph to the frame. */
  size?: 'sm' | 'lg'
}

export default function ToolMediaFrame({
  src,
  name,
  mono,
  fallback,
  className = '',
  size = 'sm',
}: ToolMediaFrameProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {src ? (
        <img src={src} alt={name} loading="lazy" className="h-full w-full object-cover" />
      ) : fallback === 'monogram' ? (
        <span
          className={`absolute inset-0 flex items-center justify-center bg-[linear-gradient(158deg,rgba(229,196,140,0.16),rgba(24,18,10,0.9))] font-bold tracking-[-0.02em] text-[#EBDCBB] ${
            size === 'lg' ? 'text-[30px]' : 'text-[17px]'
          }`}
        >
          {mono}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center gap-[6px] p-3 text-center text-[#B4AA97]"
        >
          {/* The handoff's 1.5px dashed ring at 0.35, inset to the frame. */}
          <span className="pointer-events-none absolute inset-0 rounded-[inherit] border-[1.5px] border-dashed border-current opacity-[0.35]" />
          <ImageSlotIcon className={`opacity-45 ${size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'}`} />
          <span className="max-w-[90%] text-[12.5px] font-medium tracking-[0.01em] opacity-70">
            {name}
          </span>
        </span>
      )}
    </div>
  )
}
