import type { AutomationDetail } from '@/types/automation'

/*
 * The guide a page was prerendered with.
 *
 * scripts/prerender.mjs writes each guide's API response into its page as
 *   <script id="guide-seed" type="application/json">…</script>
 * and useAutomation starts from it, so the SPA's first render is the same
 * complete page the HTML already showed — no skeleton flashing over content
 * a crawler and a reader have both already got — and makes no API call for
 * it: the seed IS the response. Navigating to another guide in the app fetches
 * as usual, since the seed only ever matches the page it was written into.
 *
 * During the prerender itself there is no DOM: the build hands the record in
 * with setGuideSeed() instead.
 */

export const GUIDE_SEED_ID = 'guide-seed'

let seed: AutomationDetail | undefined
let readFromDom = false

/** Prerender only: the record the next render should start from. */
export function setGuideSeed(detail: AutomationDetail | undefined): void {
  seed = detail
  readFromDom = true
}

function domSeed(): AutomationDetail | undefined {
  if (readFromDom || typeof document === 'undefined') return seed
  readFromDom = true
  const text = document.getElementById(GUIDE_SEED_ID)?.textContent
  if (!text) return undefined
  try {
    seed = JSON.parse(text) as AutomationDetail
  } catch {
    seed = undefined
  }
  return seed
}

/** The seeded record, when it is the one being asked for. */
export function guideSeedFor(niche: string | undefined, slug: string | undefined): AutomationDetail | undefined {
  const found = domSeed()
  return found && found.niche === niche && found.slug === slug ? found : undefined
}
