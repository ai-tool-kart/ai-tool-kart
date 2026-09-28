/*
 * Audit every prerendered guide page — SEO, links and content safety.
 *
 *   npm run build:prerendered   (writes dist/automations/**.html)
 *   npm run audit:guides        (reads them; exits 1 on any failure)
 *
 * It checks the HTML a crawler actually receives, not the components, so it
 * catches what unit tests cannot: a title shared by two pages, a canonical
 * that does not match its URL, a link to a guide that was never built, an
 * empty section, the word "undefined" on a page.
 *
 * ── What it asserts, per page ────────────────────────────────────────────────
 *
 *   head      one <title> and one meta description, each unique across the
 *             indexable pages; description ≤ 170 chars; one canonical, equal
 *             to the page's own URL; robots present (noindex pages must not
 *             be in the sitemap; every indexable page must be)
 *   outline   exactly one <h1>; headings never skip a level going down
 *   schema    BreadcrumbList and Article on every page; HowTo only when the
 *             steps are authored (stepsSource in the page's seed); FAQPage
 *             never — no guide has question-and-answer content
 *   links     every in-article internal link is a real route; every guide
 *             link resolves to a prerendered page (never the page itself);
 *             every /browse?tools= slug is a real catalogue tool; every
 *             new-tab link has rel="noopener"
 *   images    every <img> has an alt attribute
 *   content   no "undefined", "null", "NaN", "[object Object]", lorem or
 *             placeholder text; no heading-only sections; no empty lists;
 *             at least one related guide
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const GUIDES = join(DIST, 'automations')
const apiBase = (process.env.VITE_API_URL ?? 'http://localhost:3001/api').replace(/\/+$/, '')
const origin = process.env.VITE_SITE_URL?.trim().replace(/\/+$/, '')

if (!origin) {
  console.error('audit: set VITE_SITE_URL to the origin the pages were prerendered with.')
  process.exit(1)
}

/** Top-level app routes, read from the route table so the audit cannot drift from it. */
async function appRoutes() {
  const source = await readFile(join(ROOT, 'src', 'App.tsx'), 'utf8')
  const paths = [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
  return ['', ...paths].map((p) => `/${p}`)
}

function routeExists(pathname, routes) {
  return routes.some((route) => {
    const pattern = new RegExp(`^${route.replace(/:[^/]+/g, '[^/]+')}$`)
    return pattern.test(pathname)
  })
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])),
  )
  return files.flat().filter((file) => file.endsWith('.html'))
}

const decode = (text) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

/*
 * Rendering leaks and template leftovers. Deliberately NOT the plain word
 * "placeholder": real guides use it in prompts ("leave a clearly marked
 * placeholder where…"). Upper-case PLACEHOLDER and {{…}} are what a template
 * leaves behind.
 */
const BANNED = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /\blorem ipsum\b/i, /\bPLACEHOLDER\b/, /\{\{|\}\}/, /\bTODO\b/, /\bnull\b/]

async function main() {
  const routes = await appRoutes()
  const files = await walk(GUIDES)
  const pagePaths = new Set(files.map((file) => `/${relative(DIST, file).replace(/\.html$/, '')}`))
  const sitemap = await readFile(join(DIST, 'sitemap-guides.xml'), 'utf8')
  const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1])))

  const titles = new Map()
  const descriptions = new Map()
  const toolSlugs = new Set()
  const failures = []
  const stats = { pages: files.length, indexable: 0, editorial: 0, howTo: 0, related: 0, internalLinks: 0 }
  const fail = (page, message) => failures.push(`${page}: ${message}`)

  for (const file of files) {
    const html = await readFile(file, 'utf8')
    const pagePath = `/${relative(DIST, file).replace(/\.html$/, '')}`
    const expectedUrl = `${origin}${pagePath.split('/').map(encodeURIComponent).join('/')}`
    const page = decodeURIComponent(pagePath)
    const head = html.slice(0, html.indexOf('</head>'))
    const article = html.match(/<article[\s\S]*<\/article>/)?.[0] ?? ''
    if (!article) {
      fail(page, 'no <article> — the page did not render')
      continue
    }

    // ── head ──
    const titleTags = head.match(/<title[^>]*>([\s\S]*?)<\/title>/g) ?? []
    const title = decode(titleTags[0]?.replace(/<[^>]+>/g, '') ?? '')
    const descriptionTags = head.match(/<meta name="description"[^>]*>/g) ?? []
    const description = decode(attr(descriptionTags[0] ?? '', 'content') ?? '')
    const canonicals = head.match(/<link rel="canonical"[^>]*>/g) ?? []
    const canonical = decode(attr(canonicals[0] ?? '', 'href') ?? '')
    const robots = attr(head.match(/<meta name="robots"[^>]*>/)?.[0] ?? '', 'content') ?? ''
    const indexable = !robots.includes('noindex')

    if (titleTags.length !== 1 || !title.trim()) fail(page, `expected one non-empty <title>, found ${titleTags.length}`)
    if (descriptionTags.length !== 1 || !description.trim()) fail(page, 'expected one non-empty meta description')
    if (description.length > 170) fail(page, `description is ${description.length} chars`)
    if (canonicals.length !== 1) fail(page, `expected one canonical, found ${canonicals.length}`)
    else if (canonical !== decode(expectedUrl)) fail(page, `canonical ${canonical} ≠ ${expectedUrl}`)
    if (!robots) fail(page, 'no robots meta')
    if (indexable !== sitemapUrls.has(canonical)) fail(page, indexable ? 'indexable but not in the sitemap' : 'noindex but in the sitemap')
    if (indexable) {
      stats.indexable++
      titles.set(title, [...(titles.get(title) ?? []), page])
      descriptions.set(description, [...(descriptions.get(description) ?? []), page])
    }

    // ── outline ──
    const headings = [...article.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]))
    const h1s = [...html.matchAll(/<h1[\s>]/g)].length
    if (h1s !== 1) fail(page, `expected one <h1>, found ${h1s}`)
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] > headings[i - 1] + 1) fail(page, `heading skips from h${headings[i - 1]} to h${headings[i]}`)
    }

    // ── schema ──
    const seed = JSON.parse(html.match(/<script id="guide-seed" type="application\/json">([\s\S]*?)<\/script>/)?.[1] ?? 'null')
    const authored = seed?.stepsSource === 'authored'
    if (authored) stats.editorial++
    const graphs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1]))
    const types = graphs.map((g) => g['@type'])
    if (!types.includes('BreadcrumbList')) fail(page, 'no BreadcrumbList')
    if (!types.includes('Article')) fail(page, 'no Article')
    if (types.includes('HowTo') !== authored) fail(page, authored ? 'authored steps but no HowTo' : 'HowTo on derived steps')
    if (types.includes('HowTo')) stats.howTo++
    if (types.includes('FAQPage')) fail(page, 'FAQPage without FAQ content')
    const article_ = graphs.find((g) => g['@type'] === 'Article')
    if (article_ && article_.mainEntityOfPage?.['@id'] !== canonical) fail(page, 'Article @id ≠ canonical')
    const crumbs = graphs.find((g) => g['@type'] === 'BreadcrumbList')?.itemListElement ?? []
    if (crumbs.at(-1)?.item !== canonical) fail(page, 'breadcrumb does not end at the canonical')

    // ── links ──
    const anchors = [...article.matchAll(/<a\s[^>]*>/g)].map((m) => m[0])
    for (const tag of anchors) {
      const href = decode(attr(tag, 'href') ?? '')
      if (!href) {
        fail(page, 'link without href')
        continue
      }
      if (attr(tag, 'target') === '_blank' && !/noopener/.test(attr(tag, 'rel') ?? '')) fail(page, `new-tab link without noopener: ${href}`)
      if (href.startsWith('#')) {
        if (!html.includes(`id="${href.slice(1)}"`)) fail(page, `in-page link to missing #${href.slice(1)}`)
        continue
      }
      if (indexable && /^https?:\/\/(www\.)?example\.(com|org|net)\b/.test(href)) fail(page, `placeholder link ${href}`)
      if (!href.startsWith('/')) continue
      stats.internalLinks++
      const url = new URL(href, origin)
      const pathname = decodeURIComponent(url.pathname)
      if (!routeExists(url.pathname, routes)) fail(page, `link to unknown route ${href}`)
      if (pathname.startsWith('/automations/') && pathname.split('/').length === 4) {
        if (!pagePaths.has(url.pathname) && !pagePaths.has(pathname)) fail(page, `link to a guide that was not built: ${pathname}`)
        if (pathname === page) fail(page, 'links to itself')
      }
      if (url.pathname === '/browse' && url.searchParams.get('tools')) {
        for (const slug of url.searchParams.get('tools').split(',')) toolSlugs.add(slug)
      }
    }
    const relatedCards = (article.match(/id="related"[\s\S]*$/)?.[0].match(/<h3[\s\S]*?<\/h3>/g) ?? []).length
    if (relatedCards === 0) fail(page, 'no related guides')
    stats.related += relatedCards

    // ── images ──
    for (const img of html.match(/<img\s[^>]*>/g) ?? []) if (!/\salt="/.test(img)) fail(page, `<img> without alt: ${img.slice(0, 80)}`)

    // ── content ──
    const text = textOf(article)
    for (const pattern of BANNED) if (pattern.test(text)) fail(page, `visible text matches ${pattern}`)
    for (const section of article.match(/<section[^>]*>[\s\S]*?<\/section>/g) ?? []) {
      const heading = section.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/)?.[1] ?? ''
      if (textOf(section).trim().length <= textOf(heading).trim().length + 2) fail(page, `empty section "${textOf(heading).trim()}"`)
    }
    if (/<(ul|ol)[^>]*>\s*<\/\1>/.test(article)) fail(page, 'empty list')
  }

  for (const [title, pages] of titles) if (pages.length > 1) fail(pages.join(', '), `share the title "${title}"`)
  for (const [description, pages] of descriptions) if (pages.length > 1) fail(pages.join(', '), `share a description "${description.slice(0, 60)}…"`)

  // Every catalogue slug a guide links to must be a real tool.
  for (const slug of toolSlugs) {
    const response = await fetch(`${apiBase}/tools/${encodeURIComponent(slug)}`)
    if (response.status !== 200) failures.push(`/browse?tools=${slug}: catalogue answered ${response.status}`)
  }

  console.log(
    `audit: ${stats.pages} pages (${stats.indexable} indexable, ${stats.editorial} editorial, ${stats.howTo} with HowTo), ` +
      `${stats.internalLinks} internal links, ${stats.related} related-guide cards, ${toolSlugs.size} catalogue tools linked`,
  )
  if (failures.length) {
    console.error(`audit: ${failures.length} failure(s):\n  ${failures.slice(0, 40).join('\n  ')}`)
    process.exit(1)
  }
  console.log('audit: all checks passed')
}

await main()
