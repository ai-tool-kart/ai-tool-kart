import { Link } from 'react-router-dom'
import SpotCard from '@/components/ui/SpotCard'
import type { AutomationTool } from '@/types/automation'

/*
 * The tools an automation names.
 *
 * Only the first tool carries a url — the source's one link belongs to it —
 * so only the first is an outbound link; the rest are names. That is the data,
 * not a styling choice: linking a later tool to the first tool's page would be
 * a link that lies (SPEC-automations.md §3).
 *
 * `catalogueSlug` marks a tool the catalogue also lists. There is no tool
 * detail route (App.tsx has none, and useTool's own note says so), so the
 * link goes to Browse's plan view, `/browse?tools=<slug>`, which renders
 * exactly that tool's catalogue card.
 */

export default function AutomationToolsPanel({ tools }: { tools: AutomationTool[] }) {
  return (
    <SpotCard className="rounded-panel p-[18px]">
      <h2 className="relative text-[11.5px] tracking-[0.2em] text-accent uppercase">
        {tools.length === 1 ? 'Tool' : 'Tools'}
      </h2>
      <ul className="relative mt-3 flex list-none flex-col gap-[10px] p-0">
        {tools.map((tool, index) => (
          <li key={`${index}-${tool.name}`} className="flex flex-col gap-[3px]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {tool.url ? (
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[15px] font-semibold text-ink underline-offset-2 hover:text-ink hover:underline"
                >
                  {tool.name}
                  <span aria-hidden="true"> ↗</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <span className="text-[15px] font-medium text-[#D3CCE6]">{tool.name}</span>
              )}
              {tool.catalogueSlug && (
                <Link
                  to={`/browse?tools=${encodeURIComponent(tool.catalogueSlug)}`}
                  className="text-[12.5px] font-medium text-accent underline-offset-2 hover:underline"
                >
                  In our catalogue
                </Link>
              )}
            </div>
            {tool.accessNote && (
              <p className="text-[12.5px] leading-[1.5] text-pretty text-[#8A83A6]">{tool.accessNote}</p>
            )}
          </li>
        ))}
      </ul>
    </SpotCard>
  )
}
