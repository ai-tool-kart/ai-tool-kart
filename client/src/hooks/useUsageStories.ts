import { useEffect, useMemo, useState } from 'react'
import { useToolIndex } from '@/hooks/useToolIndex'
import { getUsageStories } from '@/services/usageStories'
import type { ResolvedUsageStory, UsageStory } from '@/types/usageStory'
import { resolveUsageStory } from '@/utils/usageStories'

/*
 * The usage stories, with their tool references already resolved.
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   useUsageStories
 *     ├─ services/usageStories.ts ─ GET /api/usage-stories   (cached once)
 *     └─ useToolIndex ─ services/tools.ts ─ GET /api/tools   (cached once,
 *                                                             already read by
 *                                                             three sections)
 *
 * TWO requests for the whole section, and only one of them is new: the catalogue
 * read is the same shared promise Featured, AI for Your Work and Recently Added
 * are already waiting on. Never one request per tool, and never one per story.
 *
 * ── Why the two are reported separately ──────────────────────────────────────
 *
 * A story is worth showing without its chips; it is not worth showing without
 * its text. So `failed` means the STORIES failed — the section stands down — and
 * a catalogue failure merely leaves `tools` empty on every card, which the card
 * renders by omitting its AI SETUP block. One outage should not cost more than
 * it has to.
 */

export interface UsageStoriesResource {
  /** Editorial order, tool references resolved. Empty while loading. */
  stories: ResolvedUsageStory[]
  isLoading: boolean
  /** True once the STORY request has failed. The section hides itself. */
  failed: boolean
}

export function useUsageStories(): UsageStoriesResource {
  const [stories, setStories] = useState<UsageStory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const { index } = useToolIndex()

  useEffect(() => {
    // The shared request cannot be aborted (see services/usageStories.ts), so
    // the unmount guard is a flag rather than an AbortController.
    let live = true

    getUsageStories()
      .then((items) => {
        if (!live) return
        setStories(items)
        setIsLoading(false)
      })
      .catch(() => {
        if (!live) return
        setFailed(true)
        setIsLoading(false)
      })

    return () => {
      live = false
    }
  }, [])

  /*
   * `index` is a stable reference for the life of the page, so this re-resolves
   * only when the catalogue arrives — once — rather than on every render of the
   * homepage. Each pass is a handful of Map lookups per story.
   */
  const resolved = useMemo(
    () => stories.map((story) => resolveUsageStory(story, index)),
    [stories, index],
  )

  /*
   * An unresolvable slug is a CONTENT bug: the story names a tool the catalogue
   * does not have. It is invisible on the page by design — the chip is simply
   * omitted rather than fabricated — so it is surfaced here, once, in
   * development, where the person who can fix it will see it. The server's own
   * test pins the seeded set, so this fires only for content added later.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const missing = resolved.flatMap((entry) =>
      entry.unresolvedSlugs.map((slug) => `${entry.story.id} → "${slug}"`),
    )
    if (missing.length > 0) {
      console.warn(
        `[usage stories] ${missing.length} tool reference(s) do not resolve against the ` +
          `catalogue and are not rendered:\n  ${missing.join('\n  ')}`,
      )
    }
  }, [resolved])

  return { stories: resolved, isLoading, failed }
}
