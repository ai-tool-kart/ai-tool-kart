import type { WorkflowGuide } from '@/types/guide'
import { guideStructuredData } from '@/utils/workflowGuide'

/*
 * The guide's JSON-LD, rendered in the page body (valid anywhere in the
 * document). `<` is escaped so a record's text can never close the script.
 */

export default function GuideStructuredData({ guide }: { guide: WorkflowGuide }) {
  const json = JSON.stringify(guideStructuredData(guide, window.location.origin)).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
