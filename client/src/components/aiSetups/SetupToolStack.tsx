import type { Tool } from '@/types/tool'

/*
 * The overlapping tool tiles at the top of a setup card.
 *
 * Source: AI Tool Kart Site.dc.html, the `s.tools` loop — 36px rounded squares,
 * each pulled 9px over the one before it, deepest at the left.
 *
 * ── Monograms, not logos ─────────────────────────────────────────────────────
 *
 * The prototype layers an `<image-slot>` over each tile, ready for a logo. The
 * catalogue has no logo field on a tool, so there is nothing to put there and no
 * logo asset is bundled to fake one: the tile shows the record's own `mono`,
 * which is the same two letters Browse and the assistant show for that tool.
 * The moment the catalogue gains logos, they belong on top of this tile.
 *
 * ── Why not components/ui/Monogram ───────────────────────────────────────────
 *
 * Monogram is the tool AVATAR — 42-48px, the violet `--gradient-monogram` fill,
 * white text, standing alone. This is a stacked chip: 36px, a darker fill that
 * has to read through its neighbours' shadows, and lighter text. Bending one
 * component to cover both would mean a new size and a new variant for a single
 * call site, and the result would be less clear than the ten lines below.
 */

interface SetupToolStackProps {
  /** In the setup's own order — the order the tools are run in. */
  tools: Tool[]
  /**
   * Renders empty tiles instead, one per tool the setup names.
   *
   * The card's shape is editorial and known before the catalogue answers, so it
   * holds its layout rather than reflowing when the tiles arrive.
   */
  placeholders?: number
}

const TILE =
  'relative -ml-[9px] h-9 w-9 flex-none overflow-hidden rounded-[12px] border border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_6px_14px_-8px_rgba(0,0,0,0.95)]'

export default function SetupToolStack({ tools, placeholders }: SetupToolStackProps) {
  if (placeholders !== undefined) {
    return (
      <div aria-hidden="true" className="flex items-center pl-[9px]">
        {Array.from({ length: placeholders }, (_, index) => (
          <span
            key={index}
            className={`${TILE} bg-[linear-gradient(158deg,rgba(167,139,250,0.1),rgba(21,17,42,0.95))]`}
          />
        ))}
      </div>
    )
  }

  if (tools.length === 0) return null

  return (
    <div className="flex items-center pl-[9px]">
      {tools.map((tool) => (
        <span
          key={tool.slug}
          title={tool.name}
          className={`${TILE} bg-[linear-gradient(158deg,rgba(167,139,250,0.2),rgba(21,17,42,0.95))]`}
        >
          <span className="absolute inset-0 flex items-center justify-center text-[11.5px] font-bold tracking-[-0.01em] text-[#CFC3F0]">
            {tool.mono}
          </span>
        </span>
      ))}
    </div>
  )
}
