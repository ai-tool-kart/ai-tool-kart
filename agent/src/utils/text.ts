/*
 * Text extraction and normalization for untrusted source content.
 *
 * This module never produces HTML — it only consumes it. Everything here turns
 * third-party markup into plain text so that no fetched markup can survive into
 * a prompt, a database row, or (via generation/render.ts) a WordPress post.
 * NEWS_AGENT.md §28 treats that one-way flow as a security control.
 */

/** The named entities that actually show up in feeds and article bodies. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  eacute: 'é',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  deg: '°',
}

/**
 * Decodes HTML entities, including the double-encoded forms feeds are full of
 * ("&amp;#8217;"). Bounded to two passes: unbounded decoding of attacker
 * controlled text is how "&amp;lt;script&amp;gt;" turns back into a tag.
 */
export function decodeEntities(input: string, passes = 2): string {
  let out = input
  for (let pass = 0; pass < passes; pass += 1) {
    const before = out
    out = out.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = Number.parseInt(entity.slice(2), 16)
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? safeFromCodePoint(code) : match
      }
      if (entity.startsWith('#')) {
        const code = Number.parseInt(entity.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? safeFromCodePoint(code) : match
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match
    })
    if (out === before) break
  }
  return out
}

function safeFromCodePoint(code: number): string {
  // Surrogate halves are not valid standalone scalar values.
  if (code >= 0xd800 && code <= 0xdfff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/** Blocks whose *contents* are not text at all and must be dropped wholesale. */
const DROPPED_BLOCKS = ['script', 'style', 'noscript', 'template', 'svg', 'head', 'iframe', 'form']

/**
 * Converts HTML to plain text.
 *
 * Deliberately not a parser. It removes non-content blocks with their contents,
 * turns block-level boundaries into newlines so paragraphs survive, then strips
 * every remaining tag. Because the output is plain text that is never re-emitted
 * as markup, an imperfect strip degrades text quality rather than creating an
 * injection path.
 */
export function htmlToText(html: string): string {
  if (!html) return ''
  let out = html

  // Comments first: they can wrap otherwise-visible tags.
  out = out.replace(/<!--[\s\S]*?-->/g, ' ')
  out = out.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')

  for (const tag of DROPPED_BLOCKS) {
    const block = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi')
    out = out.replace(block, ' ')
    // Unclosed variants: drop the opening tag so its attributes cannot leak.
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), ' ')
  }

  out = out.replace(/<\s*br\s*\/?\s*>/gi, '\n')
  out = out.replace(/<\/\s*(p|div|section|article|h[1-6]|li|tr|blockquote|pre)\s*>/gi, '\n\n')
  out = out.replace(/<\s*li\b[^>]*>/gi, '\n- ')

  // Everything else: strip the tag, keep the text between tags.
  out = out.replace(/<[^>]*>/g, ' ')

  out = decodeEntities(out)

  // Any tag-like residue after decoding is neutralised rather than preserved.
  out = out.replace(/<[^>]*>/g, ' ')

  return collapseWhitespace(out)
}

/** Collapses runs of spaces/tabs but preserves paragraph breaks. */
export function collapseWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Single-line plain text: no newlines at all. Used for titles and summaries. */
export function toSingleLine(input: string): string {
  return htmlToText(input).replace(/\s+/g, ' ').trim()
}

export function wordCount(input: string): number {
  const trimmed = input.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/** Truncates on a word boundary, without an ellipsis unless one is asked for. */
export function truncateWords(input: string, maxChars: number, suffix = ''): string {
  if (input.length <= maxChars) return input
  const cut = input.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + suffix
}

/**
 * Heuristic detector for prompt-injection attempts in fetched content.
 *
 * This is a flag, not a filter: the structural defences (source text confined to
 * the user turn, closed output schemas, writer fed only extracted claims) are
 * what actually stop injection. This exists so a source that keeps trying is
 * visible in the logs and can be dropped from the registry (NEWS_AGENT.md §28).
 */
const INJECTION_MARKERS = [
  /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|preceding)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+/i,
  /you\s+are\s+now\s+(?:a|an)\s+/i,
  /system\s*prompt/i,
  /reveal\s+(?:your\s+)?(?:api\s*key|secret|password|credentials|system prompt)/i,
  /(?:print|output|repeat)\s+(?:your\s+)?(?:instructions|system prompt|api key)/i,
  /new\s+instructions?\s*:/i,
  /\bBEGIN\s+SYSTEM\b/i,
  /<\/?\s*(?:system|assistant)\s*>/i,
]

export function detectInjectionMarkers(text: string): string[] {
  const found: string[] = []
  for (const pattern of INJECTION_MARKERS) {
    const match = pattern.exec(text)
    if (match) found.push(match[0].slice(0, 80))
  }
  return found
}
