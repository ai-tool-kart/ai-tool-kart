import type { WorkflowGuide } from '@/types/guide'
import { guideJsonLd, scriptJson, siteOrigin } from '@/utils/guideSeo'

/*
 * The guide's JSON-LD, rendered in the page body (valid anywhere in the
 * document). Built by utils/guideSeo.ts, the same source the prerender uses,
 * so the markup in the static HTML and after a client navigation is one.
 */

export default function GuideStructuredData({ guide }: { guide: WorkflowGuide }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: scriptJson(guideJsonLd(guide, siteOrigin())) }}
    />
  )
}
