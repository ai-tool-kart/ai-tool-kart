import { useEffect } from 'react'
import type { HeadTags } from '@/utils/guideSeo'

/*
 * Per-page head tags: <title>, description, robots, canonical and Open Graph.
 *
 * Tags are UPSERTED, never appended: a prerendered page (scripts/
 * prerender.mjs) already carries its own canonical, robots and og:* tags, and
 * adding a second canonical would give a crawler two conflicting answers.
 *
 * On unmount every tag goes back to the SITE default, not merely to what was
 * there before — on a prerendered page, "before" is that page's own tags. The
 * prerender marks what it wrote: `data-page` on tags only that page has
 * (removed on unmount), `data-default` on the title and description (holding
 * index.html's value, restored on unmount). Without those marks the previous
 * value is the default, so pages that never call the hook keep index.html's.
 *
 * The values come from utils/guideSeo.ts, which the prerender uses too.
 */

type Selector = { tag: 'meta' | 'link'; key: 'name' | 'property' | 'rel'; id: string; attr: 'content' | 'href' }

function upsert({ tag, key, id, attr }: Selector, value: string | undefined): () => void {
  let element = document.head.querySelector<HTMLElement>(`${tag}[${key}="${id}"]`)
  const previous = element?.dataset.default ?? element?.getAttribute(attr) ?? undefined
  // A tag the prerender wrote for its page alone is this page's, not the site's.
  const created = !element || element.hasAttribute('data-page')

  if (value === undefined) {
    // Absent on this page: hide any inherited tag while mounted.
    element?.remove()
    return () => {
      if (element && !created) document.head.appendChild(element)
    }
  }

  if (!element) {
    element = document.createElement(tag)
    element.setAttribute(key, id)
    document.head.appendChild(element)
  }
  element.setAttribute(attr, value)

  return () => {
    if (created) element.remove()
    else if (previous !== undefined) element.setAttribute(attr, previous)
    element.removeAttribute('data-page')
  }
}

export function useDocumentMeta(head: HeadTags | undefined): void {
  // Serialised so a rebuilt-but-equal object does not re-run the effect.
  const key = head ? JSON.stringify(head) : ''

  useEffect(() => {
    if (!head) return
    const previousTitle = document.head.querySelector<HTMLElement>('title')?.dataset.default ?? document.title
    document.title = head.title

    const restores = [
      upsert({ tag: 'meta', key: 'name', id: 'description', attr: 'content' }, head.description),
      upsert({ tag: 'meta', key: 'name', id: 'robots', attr: 'content' }, head.robots),
      upsert({ tag: 'link', key: 'rel', id: 'canonical', attr: 'href' }, head.canonical),
      upsert({ tag: 'meta', key: 'property', id: 'og:type', attr: 'content' }, head.og.type),
      upsert({ tag: 'meta', key: 'property', id: 'og:title', attr: 'content' }, head.og.title),
      upsert({ tag: 'meta', key: 'property', id: 'og:description', attr: 'content' }, head.og.description),
      upsert({ tag: 'meta', key: 'property', id: 'og:url', attr: 'content' }, head.og.url),
    ]

    return () => {
      document.title = previousTitle
      for (const restore of restores.reverse()) restore()
    }
    // `head` is intentionally absent: `key` is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
