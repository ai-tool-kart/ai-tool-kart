/*
 * Prerender every guide page into static HTML — run after `vite build` and
 * `vite build --ssr` (see `npm run build:prerendered`).
 *
 *   VITE_SITE_URL=https://aitoolkart.com VITE_API_URL=https://api…/api npm run build:prerendered
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 *
 * The client is a single-page app: without this, every URL returns the same
 * index.html — an empty <div id="root">, the site-wide title and description,
 * no canonical — and a guide's content exists only after JavaScript runs and
 * the API answers. Guides are meant to rank, so each one gets a real HTML file
 * with its content, head tags and JSON-LD in the response itself.
 *
 * ── How ──────────────────────────────────────────────────────────────────────
 *
 *  1. GET /api/automations/paths — every active guide.
 *  2. GET each guide's detail — the same response the page fetches.
 *  3. Render the real app for that URL (dist-ssr/entry-prerender.js).
 *  4. Write dist/automations/<niche>/<slug>.html from dist/index.html:
 *     the rendered markup in #root, the page's head tags (from
 *     utils/guideSeo.ts — the same source the runtime uses) and the record as
 *     a JSON seed, so the SPA boots straight into the same page.
 *  5. Write dist/sitemap-guides.xml, and dist/robots.txt pointing at it when
 *     the site does not already ship one.
 *
 * Any failure fails the run. A half-prerendered site is worse than a known
 * missing step: it would look finished.
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const ENTRY = join(ROOT, 'dist-ssr', 'entry-prerender.js')
const CONCURRENCY = 8
const SEED_ID = 'guide-seed' // services/guideSeed.ts GUIDE_SEED_ID

const origin = process.env.VITE_SITE_URL?.trim().replace(/\/+$/, '')
const apiBase = (process.env.VITE_API_URL ?? 'http://localhost:3001/api').replace(/\/+$/, '')

if (!origin) {
  console.error(
    'prerender: VITE_SITE_URL is not set. Canonical URLs, og:url and structured data must name the\n' +
      'public site (e.g. https://aitoolkart.com); refusing to guess.',
  )
  process.exit(1)
}

const escapeAttr = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

async function getJson(path) {
  const response = await fetch(`${apiBase}${path}`)
  if (!response.ok) throw new Error(`GET ${apiBase}${path} → ${response.status}`)
  return response.json()
}

/** The page's head, applied to the built index.html. Marks let useDocumentMeta restore site defaults. */
function applyHead(template, head) {
  const titleMatch = template.match(/<title>([\s\S]*?)<\/title>/)
  const descriptionMatch = template.match(/<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/)
  if (!titleMatch || !descriptionMatch) {
    throw new Error('dist/index.html has no <title> or meta description to replace — has index.html changed?')
  }

  const pageTags = [
    `<meta name="robots" content="${escapeAttr(head.robots)}" data-page>`,
    head.canonical ? `<link rel="canonical" href="${escapeAttr(head.canonical)}" data-page>` : '',
    `<meta property="og:type" content="${escapeAttr(head.og.type)}" data-page>`,
    `<meta property="og:title" content="${escapeAttr(head.og.title)}" data-page>`,
    `<meta property="og:description" content="${escapeAttr(head.og.description)}" data-page>`,
    head.og.url ? `<meta property="og:url" content="${escapeAttr(head.og.url)}" data-page>` : '',
    `<meta property="og:site_name" content="AI Tool Kart" data-page>`,
  ].filter(Boolean)

  return template
    .replace(titleMatch[0], `<title data-default="${escapeAttr(titleMatch[1])}">${escapeText(head.title)}</title>`)
    .replace(
      descriptionMatch[0],
      `<meta name="description" content="${escapeAttr(head.description)}" data-default="${descriptionMatch[1]}" />`,
    )
    .replace('</head>', `    ${pageTags.join('\n    ')}\n  </head>`)
}

function applyBody(template, html, detail) {
  const root = '<div id="root"></div>'
  if (!template.includes(root)) throw new Error('dist/index.html has no empty <div id="root"></div>.')
  return template.replace(
    root,
    `<div id="root">${html}</div>\n    <script id="${SEED_ID}" type="application/json">${scriptJson(detail)}</script>`,
  )
}

/** Runs `task` over `items`, CONCURRENCY at a time. */
async function pool(items, task) {
  let next = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await task(item)
    }
  })
  await Promise.all(workers)
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  const started = Date.now()
  const template = await readFile(join(DIST, 'index.html'), 'utf8')
  const { renderGuide } = await import(pathToFileURL(ENTRY).href)

  const { items } = await getJson('/automations/paths')
  console.log(`prerender: ${items.length} guides from ${apiBase} → ${origin}`)

  const written = []
  const failures = []
  await pool(items, async ({ niche, slug }) => {
    try {
      const { automation } = await getJson(`/automations/${encodeURIComponent(niche)}/${encodeURIComponent(slug)}`)
      const { path, html, head } = renderGuide(automation, origin)
      // `<slug>.html` at the DECODED path ("automations/Real Estate/<slug>.html"):
      // a static host decodes the request path before looking up the file, and
      // vercel.json's `cleanUrls` serves /…/<slug> from <slug>.html — before the
      // SPA rewrite, which only catches paths with no file. A `<slug>/index.html`
      // would only answer the trailing-slash URL, not the canonical one.
      const file = join(DIST, `${decodeURIComponent(path)}.html`)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, applyBody(applyHead(template, head), html, automation))
      // A noindex page (the demo) is prerendered but never listed.
      if (!head.robots.startsWith('noindex')) written.push(head.canonical)
    } catch (error) {
      failures.push(`${niche}/${slug}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  if (failures.length > 0) {
    console.error(`prerender: ${failures.length} guide(s) failed:\n  ${failures.slice(0, 20).join('\n  ')}`)
    process.exit(1)
  }

  written.sort()
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    written.map((url) => `  <url><loc>${escapeText(url)}</loc></url>`).join('\n') +
    '\n</urlset>\n'
  await writeFile(join(DIST, 'sitemap-guides.xml'), sitemap)

  const robots = join(DIST, 'robots.txt')
  if (!(await exists(robots))) {
    await writeFile(robots, `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap-guides.xml\n`)
  }

  console.log(`prerender: wrote ${items.length} pages (${written.length} in sitemap-guides.xml) in ${Date.now() - started} ms`)
}

await main()
