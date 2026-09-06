import AssistantChip from '@/components/assistant/AssistantChip'
import type { AssistantToolSummary, AssistantWorkflowStep } from '@/types/assistant'

/*
 * The four body shapes a plan section can take, and the mapping from the API's
 * six fields onto them.
 *
 * Design: chips (Tools, Agents), an arrow chain (Workflow), a line of prose
 * (Prompts, Comparison) and a numbered list (Steps). Each is its own component
 * because two sections share three of the four, and because keeping them apart
 * is what stops the panel from collapsing structured data into a paragraph.
 *
 * Nothing here invents content. Every string rendered came from the server, and
 * every tool named was grounded against the catalogue before it was sent.
 */

/** The muted line a section shows when the plan legitimately has nothing for it. */
function EmptyNote({ children }: { children: string }) {
  return (
    <div className="text-[12.5px] leading-[1.5] tracking-[-0.006em] text-subtle-dim italic">
      {children}
    </div>
  )
}

/* ─── Tools ─────────────────────────────────────────────────────────────────── */

interface PlanToolsProps {
  tools: AssistantToolSummary[]
  /** Opens the catalogue on that tool. Milestone 3 replaces this with /tools/:slug. */
  onOpenTool: (tool: AssistantToolSummary) => void
}

/**
 * The plan's tools as chips.
 *
 * The chip's title carries the tagline and pricing tier the API already sent, so
 * the reader can tell two similar names apart without leaving the panel. The
 * design's chip is a single label and stays one.
 */
export function PlanTools({ tools, onOpenTool }: PlanToolsProps) {
  return (
    <div className="flex flex-wrap gap-[6px]">
      {tools.map((tool) => (
        <AssistantChip
          key={tool.id}
          tone="accent"
          onClick={() => onOpenTool(tool)}
          title={`${tool.tagline} · ${tool.pricingTier}`}
        >
          {tool.name}
        </AssistantChip>
      ))}
    </div>
  )
}

/* ─── Agents ────────────────────────────────────────────────────────────────── */

interface PlanAgentsProps {
  agents: string[]
  /** Searches the catalogue for tools that could play that agent's part. */
  onSearch: (query: string) => void
}

/**
 * Agent roles as chips.
 *
 * `agents` is the one plan field the schema allows to be empty — a plan whose
 * work needs no standalone agent is a real answer, and the panel says so rather
 * than leaving a blank card behind a tick.
 */
export function PlanAgents({ agents, onSearch }: PlanAgentsProps) {
  if (agents.length === 0) return <EmptyNote>No standalone agents in this plan.</EmptyNote>

  return (
    <div className="flex flex-wrap gap-[6px]">
      {agents.map((agent) => (
        <AssistantChip key={agent} tone="accent" onClick={() => onSearch(agent)}>
          {agent}
        </AssistantChip>
      ))}
    </div>
  )
}

/* ─── Workflow ──────────────────────────────────────────────────────────────── */

/**
 * The workflow as the design's arrow chain.
 *
 * The API sends each stage as `{ stage, tool?, why }`, and all three survive:
 * the stage is the chain link, the tool that staffs it is named beside it, and
 * `why` is the link's tooltip. A stage the catalogue could not staff is shown
 * with no tool rather than dropped — the honest shape of the plan includes the
 * step nothing covers.
 */
export function PlanWorkflow({ workflow }: { workflow: AssistantWorkflowStep[] }) {
  return (
    <ol className="flex list-none flex-wrap items-center gap-[7px] p-0">
      {workflow.map((step, index) => (
        <li
          key={`${step.stage}-${index}`}
          title={step.why}
          className="inline-flex items-center gap-[7px] text-[12.5px] font-medium text-[#D3CCE6]"
        >
          <span className="capitalize">{step.stage}</span>
          {step.tool && <span className="text-[11.5px] text-subtle">{step.tool.name}</span>}
          {index < workflow.length - 1 && (
            <span aria-hidden="true" className="text-[11px] text-[#6B6488]">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/* ─── Prompts / Comparison ──────────────────────────────────────────────────── */

/** A single line of prose. Used by both note-shaped sections. */
export function PlanNote({ text }: { text: string }) {
  return (
    <div className="text-[12.5px] leading-[1.5] tracking-[-0.006em] text-pretty text-[#C0B9D6]">
      {text}
    </div>
  )
}

/* ─── Steps ─────────────────────────────────────────────────────────────────── */

/** The numbered running order. `<ol>` so the numbers mean something to a reader. */
export function PlanSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex list-none flex-col gap-[7px] p-0">
      {steps.map((step, index) => (
        <li
          key={`${index}-${step}`}
          className="flex items-baseline gap-[9px] text-[12.5px] leading-[1.45] tracking-[-0.006em] text-[#C0B9D6]"
        >
          <span
            aria-hidden="true"
            className="flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[6px] border border-[rgba(178,150,255,0.26)] bg-[rgba(124,88,244,0.12)] text-[10px] font-bold text-[#C8AEFF]"
          >
            {index + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}
