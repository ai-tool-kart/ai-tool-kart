/*
 * RSS / Atom / RDF parsing.
 *
 * fast-xml-parser handles the XML; everything below is the normalization that
 * turns four incompatible feed dialects into one shape. Feeds in the wild are
 * inconsistent enough that this layer matters more than the parser does.
 *
 * All extracted text is treated as untrusted: titles and summaries are reduced
 * to plain text here so no markup from a feed can travel further.
 */

import { XMLParser } from 'fast-xml-parser'
import { sourceError } from '../domain/errors.ts'
import { decodeEntities, toSingleLine, htmlToText } from '../utils/text.ts'

export interface RawFeedItem {
  title: string
  link: string
  summary?: string
  publishedAt?: string
  guid?: string
}

export interface ParsedFeed {
  title?: string
  items: RawFeedItem[]
  /** Items present in the document that could not be normalised. */
  skipped: number
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  /*
   * Entity processing is left to us, not the XML layer.
   *
   * fast-xml-parser caps entity expansion at 1000 replacements as a
   * billion-laughs defence, and legitimately large feeds exceed it — the AWS
   * Machine Learning blog feed carries 1094 entities in 570KB and failed to
   * parse at all. Raising a security limit to accommodate real content is the
   * wrong trade.
   *
   * Instead the parser does no entity work (removing that attack surface
   * entirely) and the extracted text goes through decodeEntities in utils/text,
   * which is bounded to two passes, unit-tested, and already applied to every
   * other piece of untrusted text in the pipeline.
   */
  processEntities: false,
  htmlEntities: false,
  trimValues: true,
  // Never coerce: a title of "2024" or a guid of "0755" must stay a string.
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
})

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** Feed nodes are sometimes strings, sometimes { '#text': ... } objects. */
function nodeText(node: unknown): string {
  if (node === undefined || node === null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return nodeText(node[0])
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>
    if ('#text' in record) return nodeText(record['#text'])
    if ('__cdata' in record) return nodeText(record.__cdata)
  }
  return ''
}

/**
 * Atom links are an array of typed <link> elements; the useful one is
 * rel="alternate" (or the first one with no rel at all).
 */
function atomLink(entry: Record<string, unknown>): string {
  const links = asArray(entry.link as unknown)
  let fallback = ''
  for (const link of links) {
    if (typeof link === 'string') {
      if (!fallback) fallback = link
      continue
    }
    if (typeof link !== 'object' || link === null) continue
    const record = link as Record<string, unknown>
    const href = typeof record['@_href'] === 'string' ? record['@_href'] : ''
    if (!href) continue
    const rel = typeof record['@_rel'] === 'string' ? record['@_rel'] : ''
    if (rel === 'alternate' || rel === '') return href
    if (!fallback) fallback = href
  }
  return fallback
}

function firstText(entry: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const text = nodeText(entry[key])
    if (text) return text
  }
  return ''
}

/**
 * Normalises one entry. Returns undefined for entries missing a title or link,
 * which is the correct outcome for the separator/placeholder entries some feeds
 * emit — a malformed item is skipped, never fatal (NEWS_AGENT.md §24).
 */
function normalizeEntry(entry: Record<string, unknown>, isAtom: boolean): RawFeedItem | undefined {
  const title = toSingleLine(firstText(entry, ['title']))
  if (!title) return undefined

  // Entities are not decoded by the parser (see the config note above), so a
  // URL like ".../a?x=1&amp;y=2" must be decoded here or the query string would
  // be wrong in both the canonical URL and the published link.
  const rawLink = isAtom ? atomLink(entry) : firstText(entry, ['link', 'guid', 'id'])
  const link = decodeEntities(rawLink).trim()
  if (!link || !/^https?:\/\//i.test(link)) return undefined

  const summaryRaw = firstText(entry, [
    'summary',
    'description',
    'content:encoded',
    'content',
    'media:description',
    'subtitle',
  ])

  const publishedAt = firstText(entry, [
    'published',
    'pubDate',
    'updated',
    'dc:date',
    'date',
    'lastBuildDate',
  ])

  const guid = firstText(entry, ['guid', 'id'])

  const summary = summaryRaw ? htmlToText(summaryRaw) : ''

  return {
    title,
    link,
    ...(summary ? { summary } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(guid ? { guid } : {}),
  }
}

/**
 * Parses an RSS 2.0, Atom or RDF/RSS 1.0 document.
 *
 * Throws only when the document is not a feed at all — a source that started
 * returning an HTML error page is a source failure, and the caller records it
 * as such rather than silently ingesting nothing.
 */
export function parseFeed(xml: string, sourceId: string): ParsedFeed {
  let document: Record<string, unknown>
  try {
    document = parser.parse(xml) as Record<string, unknown>
  } catch (cause) {
    throw sourceError('SOURCE_PARSE', 'Feed is not well-formed XML', {
      sourceId,
      cause: String(cause).slice(0, 200),
    })
  }

  let entries: unknown[] = []
  let feedTitle = ''
  let isAtom = false

  const rss = document.rss as Record<string, unknown> | undefined
  const feed = document.feed as Record<string, unknown> | undefined
  const rdf = (document['rdf:RDF'] ?? document.RDF) as Record<string, unknown> | undefined

  if (rss) {
    const channel = (Array.isArray(rss.channel) ? rss.channel[0] : rss.channel) as
      | Record<string, unknown>
      | undefined
    feedTitle = toSingleLine(nodeText(channel?.title))
    entries = asArray(channel?.item as unknown)
  } else if (feed) {
    isAtom = true
    feedTitle = toSingleLine(nodeText(feed.title))
    entries = asArray(feed.entry as unknown)
  } else if (rdf) {
    const channel = rdf.channel as Record<string, unknown> | undefined
    feedTitle = toSingleLine(nodeText(channel?.title))
    entries = asArray(rdf.item as unknown)
  } else {
    throw sourceError('SOURCE_PARSE', 'Document contains no <rss>, <feed> or <rdf:RDF> root', {
      sourceId,
    })
  }

  const items: RawFeedItem[] = []
  let skipped = 0
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      skipped += 1
      continue
    }
    try {
      const normalized = normalizeEntry(entry as Record<string, unknown>, isAtom)
      if (normalized) items.push(normalized)
      else skipped += 1
    } catch {
      // One malformed entry never costs us the rest of the feed.
      skipped += 1
    }
  }

  return { ...(feedTitle ? { title: feedTitle } : {}), items, skipped }
}
