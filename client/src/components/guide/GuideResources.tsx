import { ExternalIcon } from '@/components/guide/guideStyles'
import type { GuideResource } from '@/types/automation'

/*
 * Links a guide hands the reader — a prompt file, a template, a tutorial.
 * Used at three levels (a "Before you start" item, a step, the whole guide),
 * and only ever rendered for resources an editor actually added.
 */

const KIND_LABEL: Record<NonNullable<GuideResource['kind']>, string> = {
  prompt: 'Prompt',
  template: 'Template',
  example: 'Example',
  tutorial: 'Tutorial',
  reference: 'Reference',
  checklist: 'Checklist',
}

export function ResourceLink({ resource }: { resource: GuideResource }) {
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex items-start gap-3 rounded-[12px] border border-white/[0.07] bg-white/[0.025] px-3 py-[10px] transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-accent-wash"
    >
      <span className="min-w-0 flex-auto">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-medium text-ink group-hover:text-ink">{resource.title}</span>
          {resource.kind && (
            <span className="text-[10.5px] font-semibold tracking-[0.12em] text-[#8A83A6] uppercase">
              {KIND_LABEL[resource.kind]}
            </span>
          )}
        </span>
        {resource.description && (
          <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-[#8A83A6]">{resource.description}</span>
        )}
      </span>
      <ExternalIcon className="mt-[2px] h-4 w-4 flex-none text-accent" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export function ResourceList({ resources, className = '' }: { resources: GuideResource[]; className?: string }) {
  if (!resources.length) return null
  return (
    <ul className={`flex list-none flex-col gap-2 p-0 ${className}`}>
      {resources.map((resource) => (
        <li key={resource.url}>
          <ResourceLink resource={resource} />
        </li>
      ))}
    </ul>
  )
}
