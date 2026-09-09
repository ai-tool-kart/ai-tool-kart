import type { CSSProperties, ReactNode } from 'react'

/*
 * The outer element of every Community card, and the only place in the section
 * that decides "is this a link or not".
 *
 * ── Why a shell rather than two card components ──────────────────────────────
 *
 * The Discord card and the social cards look nothing alike, so they are written
 * separately. What they must NOT do separately is decide how an external link
 * behaves — that is where `target="_blank"` without `rel`, or an `href` of
 * `undefined`, gets in. Both go through here, so the security attributes and
 * the unconfigured branch are written once.
 *
 * ── Unconfigured channels ────────────────────────────────────────────────────
 *
 * With no usable URL (see utils/community.ts) the card renders as a plain
 * <div>: same box, same padding, same place in the grid, but not an anchor, not
 * focusable, and with nothing for a keyboard user to land on and discover leads
 * nowhere. That is deliberately different from a disabled <a href="#"> or an
 * anchor with no href, both of which still read as "link" to a screen reader.
 * The caller mutes its own CTA to match — see the `disabled` render in each card.
 *
 * ── The accessible name ──────────────────────────────────────────────────────
 *
 * Given explicitly rather than left to the card's contents, which would read as
 * one run-on string ("X @aitoolkart Launch notes, one-line verdicts … Follow").
 * It ends with "opens in a new tab", the same phrasing the featured tool tiles
 * use, because a new tab with no warning is disorienting when you cannot see it
 * happen.
 */

interface CommunityCardShellProps {
  /** Absolute http(s) URL, already validated. `undefined` renders a non-link. */
  href?: string
  /** Accessible name, e.g. "Follow AI Tool Kart on X". */
  label: string
  className: string
  style?: CSSProperties
  /** Entry-reveal delay in seconds, or "stagger" to derive it from siblings. */
  reveal?: string
  children: ReactNode
}

export default function CommunityCardShell({
  href,
  label,
  className,
  style,
  reveal,
  children,
}: CommunityCardShellProps) {
  if (!href) {
    return (
      <div data-spot="1" data-reveal={reveal} style={style} className={className}>
        {children}
      </div>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
      data-spot="1"
      data-reveal={reveal}
      style={style}
      className={className}
    >
      {children}
    </a>
  )
}
