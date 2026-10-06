import { TILE } from '@/components/aiSetups/setupCardStyles'
import type { ToolIndex } from '@/services/tools'
import type { AutomationCard } from '@/types/automation'

/*
 * The overlapping tool tiles at the top of a workflow card.
 *
 * The setup card's tile (aiSetups/setupCardStyles TILE), fed from a guide
 * record.
 *
 * ── Where each tile's letters come from ──────────────────────────────────────
 *
 * The catalogue has no logo images; a tool's avatar IS its `mono` ("Cl",
 * "Zp"), and the tile draws exactly that. So:
 *
 *   catalogue   the importer matched the tool (`catalogueTools`) and the
 *               catalogue read has it → that record's own `mono`, full tint.
 *   derived     no catalogue record → the name's first two letters, on a
 *               visibly quieter tile. These are the majority: most guide tools
 *               are niche products the catalogue does not list.
 *
 * Never a derived tile where a catalogue record exists. While the catalogue is
 * loading, tiles hold their shape empty rather than flashing derived letters
 * that would then change; if it fails, every tile falls back to derived.
 *
 * The stack is decorative (`aria-hidden`): the card's name line says the same
 * thing in words, and a screen reader should hear it once.
 */

/** Tiles before "+N". Three reads cleanly at the narrowest card width. */
const SHOWN = 3

const CATALOGUE_FILL = 'bg-[linear-gradient(158deg,rgba(167,139,250,0.2),rgba(21,17,42,0.95))]'
const DERIVED_FILL = 'bg-[linear-gradient(158deg,rgba(167,139,250,0.09),rgba(21,17,42,0.95))]'
const LETTERS = 'absolute inset-0 flex items-center justify-center text-[11.5px] font-bold tracking-[-0.01em]'

/** "Booke AI" → "Bo", "M365 Copilot" → "M3". Letters and digits only. */
function derivedMono(name: string): string {
  const chars = name.replace(/[^\p{L}\p{N}]/gu, '')
  return chars.slice(0, 1).toUpperCase() + chars.slice(1, 2).toLowerCase()
}

interface WorkflowToolStackProps {
  automation: AutomationCard
  index: ToolIndex | undefined
  status: 'loading' | 'ready' | 'unavailable'
}

export default function WorkflowToolStack({ automation, index, status }: WorkflowToolStackProps) {
  const { tools } = automation
  if (tools.length === 0) return null

  const shown = tools.slice(0, SHOWN)
  const extra = tools.length - shown.length
  const slugFor = new Map(automation.catalogueTools?.map((link) => [link.name, link.catalogueSlug]))

  return (
    <div aria-hidden="true" className="flex min-w-0 items-center pl-[9px]">
      {shown.map((name, position) => {
        const key = `${position}-${name}`
        if (status === 'loading') {
          return <span key={key} className={`${TILE} ${DERIVED_FILL}`} />
        }
        const slug = slugFor.get(name)
        const record = slug ? index?.get(slug) : undefined
        return (
          <span key={key} title={name} className={`${TILE} ${record ? CATALOGUE_FILL : DERIVED_FILL}`}>
            <span className={`${LETTERS} ${record ? 'text-[#CFC3F0]' : 'text-[#A49BC4]'}`}>
              {record ? record.mono : derivedMono(name)}
            </span>
          </span>
        )
      })}
      {extra > 0 && (
        <span title={tools.slice(SHOWN).join(', ')} className={`${TILE} ${DERIVED_FILL}`}>
          <span className={`${LETTERS} text-[#A49BC4]`}>+{extra}</span>
        </span>
      )}
    </div>
  )
}
