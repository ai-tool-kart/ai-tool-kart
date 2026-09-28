import { useEffect } from 'react'

/*
 * Per-page <title>, meta description and canonical link.
 *
 * The app had no head management — index.html's static title and description
 * served every route. This is the smallest thing that fixes that without a
 * dependency: it rewrites the tags index.html already has, and puts back what
 * was there on unmount, so a page that does not call it still gets the
 * site-wide defaults.
 *
 * Crawlers that run JavaScript (Google's does) read the result. Crawlers that
 * do not will need prerendering; that is a build concern, not this hook's.
 */

export interface DocumentMeta {
  title: string
  description: string
  /** Absolute URL. Omit to leave the page without a canonical link. */
  canonical?: string
}

export function useDocumentMeta(meta: DocumentMeta | undefined): void {
  const title = meta?.title
  const description = meta?.description
  const canonical = meta?.canonical

  useEffect(() => {
    if (!title) return

    const previousTitle = document.title
    document.title = title

    let descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = descriptionTag?.content
    if (!descriptionTag) {
      descriptionTag = document.createElement('meta')
      descriptionTag.name = 'description'
      document.head.appendChild(descriptionTag)
    }
    descriptionTag.content = description ?? ''

    let canonicalTag: HTMLLinkElement | undefined
    if (canonical) {
      canonicalTag = document.createElement('link')
      canonicalTag.rel = 'canonical'
      canonicalTag.href = canonical
      document.head.appendChild(canonicalTag)
    }

    return () => {
      document.title = previousTitle
      if (previousDescription === undefined) descriptionTag.remove()
      else descriptionTag.content = previousDescription
      canonicalTag?.remove()
    }
  }, [title, description, canonical])
}
