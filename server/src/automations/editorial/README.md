# Guide editorial content

Hand-written content for individual guide pages (`/automations/:niche/:slug`).

Every guide works without a file here: it falls back to its imported record and
three generated steps (see [Fallback](#9-how-fallback-works)). Add a file only
when a person has written real content for that guide.

**Content rules.** Every claim about a tool must be supported by a source you
can point to (the vendor's own pages, or the imported record's source). No
invented prices, statistics, capabilities, resources or links. Leave a field
out rather than fill it with generic text: an absent field hides its section;
a filler field publishes filler to every reader and every search engine.

---

## 1. How to add an editorial guide

1. Find the guide's automation ID ([section 2](#2-how-to-find-a-guides-automation-id)).
2. Create a JSON file in this folder ([section 3](#3-where-the-editorial-json-lives)).
3. Write only the fields you have real content for ([section 4](#4-available-fields)).
4. Preview and test it ([section 10](#10-how-to-preview-and-test-a-guide-locally)).

**Start from a real example.** The production guides in this folder each
show a different kind of workflow:

| File | Intent |
|---|---|
| `job-seekers-career-changers--prepare-to-negotiate-salary-before-accepting-an-offer.json` | A personal task |
| `fitness-salon-personal-services--i-want-ai-to-write-and-design-my-facebook-and-instagram-ads-for.json` | Creative / marketing, several tools |
| `sales-teams--i-want-ai-to-help-me-write-personalized-cold-sales-emails-that.json` | Repeated business work |

Every tool claim in them comes from the guide's own record or from the tool's
catalogue entry. Write new guides the same way.

## 2. How to find a guide's automation ID

The ID is the `id` field of the guide's record in `../data/<niche-slug>.json`.
From a page URL such as
`/automations/Accountants%20%26%20Bookkeepers/how-do-i-get-my-bank-transactions-categorized-automatically`,
search the data by its slug (the last path segment):

```sh
cd server/src/automations/data
grep -B2 '"slug": "how-do-i-get-my-bank-transactions-categorized-automatically"' *.json
#   accountants-bookkeepers.json-    "id": "accountants-bookkeepers-35e43d4c1d",
```

Or ask the running API, which returns it as `automation.id`:

```sh
curl -s 'http://localhost:3001/api/automations/Accountants%20%26%20Bookkeepers/how-do-i-get-my-bank-transactions-categorized-automatically' | grep -o '"id":"[^"]*"' | head -1
```

Use the **id, not the slug**: the id survives a title edit on re-import, and
the slug does not. Slugs are unique only within a niche; ids are unique
everywhere.

## 3. Where the editorial JSON lives

In this folder, one file per guide: `server/src/automations/editorial/<niche>--<slug>.json`.
The file name is for people. Only `automationId` inside it links it to a
record.

**Why not in `../data/`?** `npm run import:automations` rewrites `../data/*.json`
wholesale, so anything written there is erased by the next import. This folder
is never touched by the importer. `../editorial.ts` merges each file onto its
record when the server starts.

A complete worked example lives in `../demo/editorial/`. It loads in
development only, and its page is marked `noindex`.

## 4. Available fields

Every field is optional except `automationId`. **An empty list is rejected;
leave the field out instead**, so "absent" has one spelling. The authoritative
schema is `AutomationEditorialSchema` in `../schema.ts`, and length limits are
`AUTOMATIONS` in `../../config/limits.ts`.

| Field | Type | Renders as |
|---|---|---|
| `automationId` | string (required) | Links the file to its record |
| `headline` | string, ≤120 | The H1 and page title, used instead of the record's search-phrased title |
| `metaDescription` | string, ≤170 | `<meta name="description">` |
| `lede` | string, ≤400 | The short introduction under the H1 |
| `updatedAt` | `"YYYY-MM-DD"` | "Updated …" in the hero, and `dateModified` in the Article schema. Set it when a person has reviewed the guide. |
| `intro` | string[] (paragraphs) | "Why this workflow matters" |
| `learningOutcomes` | string[] | "What you'll learn" |
| `beforeYouStart` | `{ title, description?, resource? }[]` | "What you'll need" |
| `steps` | step[] | The interactive workflow and "The workflow, explained" ([section 5](#5-how-to-create-custom-steps)) |
| `expectedResult` | `{ summary, checklist? }` | "What you'll end up with" and "Check before you publish" |
| `tips` | string[] | "Tips & best practices" |
| `commonIssues` | `{ problem, solution }[]` | "Common issues & fixes" |
| `resources` | resource[] | "Resources" ([section 7](#7-how-to-add-resources)) |
| `relatedGuides` | `{ niche, slug }[]`, ≤6 | Shown first in "Related workflows" ([section 8](#8-how-to-add-related-guides)) |
| `closing` | `{ title, body }` | The closing call to action |

## 5. How to create custom steps

When `steps` is present it **replaces** the three generated steps completely.
Order is the array order; there is no step-number field. Up to 12 steps.

```jsonc
"steps": [
  {
    "title": "Correct the photos as one set",          // required, ≤80
    "body": "One-sentence description of the step.",   // required, ≤600
    "explanation": ["Why this step matters…", "What to watch for…"], // "Why this step matters" + the written walkthrough
    "instructions": ["Upload the set.", "Turn on colour correction."], // "Do this", numbered
    "tools": [ /* section 6 */ ],
    "prompt": "Copyable prompt text",                  // shown with a Copy button
    "expectedOutcome": "What the reader has now",      // "You should now have:"
    "tips": ["One practical tip."],
    "resources": [ /* section 7 */ ],
    "cta": { "label": "Open the template", "url": "https://…" }, // an outline button, never the primary action
    "alternatives": [{ "name": "Other tool", "why": "When you'd pick it" }]
  }
]
```

- **`explanation`** is article prose: why the step exists and what goes wrong
  in it. When any step has one, the page adds "The workflow, explained", with
  one H3 per step.
- **`instructions`** are what to do, one action each.
- Authored `steps` are what make a guide eligible for HowTo structured data
  (built from each step's title, `body` and `instructions`). Generated steps
  never get it.

## 6. How to attach tools to steps

Tools belong to steps. The guide's tool list is simply every step's tools,
first appearance first.

```jsonc
"tools": [
  {
    "name": "CapCut",                                // required
    "url": "https://www.capcut.com",                 // the tool's own site
    "catalogueSlug": "capcut",                       // ONLY a real catalogue tool id
    "why": "What this tool does in THIS step, and why it is the one used.",
    "accessNote": "…"                                // anything the reader must know before signing up (sourced)
  }
]
```

- **`why` is the most important field.** It turns a tool list into a workflow:
  say what the tool does in this step, not what the product does in general.
- **`url`** must be the tool's own page. An editor-supplied url is labelled
  "Visit {tool}".
- **`catalogueSlug`** links to the tool's catalogue entry (`/browse?tools=<slug>`).
  Use it only for a tool the catalogue really lists. The ids are in
  `server/src/catalogue/data/tools.json`, or check
  `GET /api/tools/<slug>`. `npm run audit:guides` fails on a slug the catalogue
  does not have.
- If a step names a tool the imported record also lists (same `name`), the
  record's catalogue link, access note and price label fill in whatever you
  left out.

## 7. How to add resources

```jsonc
{ "title": "Shot-order template", "url": "https://…", "kind": "template", "description": "Optional one line" }
```

- `kind` is one of `prompt`, `template`, `example`, `tutorial`, `reference`,
  `checklist`. It sets the label only.
- They can go in three places: guide-level `resources`, a step's `resources`,
  or a `beforeYouStart` item's single `resource`.
- **Link only to things that exist.** We host no downloads, so a "download the
  prompt" resource needs a real URL. Otherwise put the text in the step's
  `prompt`, which already has a Copy button.

## 8. How to add related guides

```jsonc
"relatedGuides": [
  { "niche": "Real Estate", "slug": "i-want-to-turn-my-listing-photos-into-a-walkthrough-video-using" }
]
```

- These are **curated** picks, shown first and in your order. Each must be a
  real, active guide; not this guide, and not listed twice. The server rejects
  anything else at boot.
- **You don't have to add any.** Every guide already gets six related guides
  automatically (`../related.ts`):
  1. your curated picks, then
  2. guides from the same niche ranked by relevance to this guide's title, and
  3. the next two guides in the niche, in import order, always included.

  The third rule gives every guide at least two inbound links, so no guide
  page is orphaned. A test in `server/tests/related.test.ts` holds that across
  the whole catalogue.

## 9. How fallback works

The client's `utils/workflowGuide.ts` turns either kind of record into the
same page model, **section by section**. Each authored field is used as
written; a missing one falls back as below, or its section is hidden.

| Section | With editorial content | Without it (basic guide) |
|---|---|---|
| H1 / title | `headline` | The record's `title` |
| Description | `metaDescription` | Summary + step/tool count, truncated |
| Intro under H1 | `lede` | "A 3-step AI workflow using …" |
| Overview | "Why this workflow matters" (`intro`) + summary | "What this workflow solves" (summary) |
| What you'll need | `beforeYouStart` | "Access to {tool}" for each tool, plus the record's setup note |
| What you'll learn | `learningOutcomes` | What the page covers (tool, prompt, steps) |
| Workflow steps | `steps` | Generated: Open the tool → Use this prompt → How it works |
| The workflow, explained | Steps with `explanation` | **Hidden** |
| What you'll end up with | `expectedResult` | **Hidden** |
| Tips / Common issues / Resources | `tips` / `commonIssues` / `resources` | **Hidden** |
| Related workflows | Curated, then automatic | Automatic |
| Closing CTA | `closing` | "Ready to try it? Start with step 1…" |
| Structured data | Breadcrumb + Article (+ `dateModified`) + **HowTo** | Breadcrumb + Article. No HowTo: generated steps are not a written procedure. |

No FAQ structured data is emitted for any guide, because no guide has
question-and-answer content. Common issues are problem/solution notes, not FAQs.

Adding an overlay changes only its own guide. A test holds this across the
whole catalogue (`server/tests/editorial.test.ts`).

## 10. How to preview and test a guide locally

```sh
# 1. Run the API and the site (two terminals)
cd server && npm run dev        # validates every file in this folder at boot
cd client && npm run dev        # http://localhost:5173

# 2. Open the guide
#    http://localhost:5173/automations/<Niche>/<slug>
#    (the niche is URL-encoded: "Sales Teams" → Sales%20Teams)

# 3. Run the server tests
cd server && npm test

# 4. Before shipping: prerender every guide and audit the output
cd client
VITE_SITE_URL=https://<site> npm run build:prerendered
VITE_SITE_URL=https://<site> npm run audit:guides
```

- **Boot (step 1).** Stops on a typo, an unknown field, an empty list, a bad
  date, an id that matches no record, or a related guide that doesn't exist.
  It names the file and the field.
- **Tests (step 3).** Include a lint of every file here. They fail on an
  `example.com` link, a template leftover (TODO, `{{…}}`), a future
  `updatedAt`, or a `catalogueSlug` the catalogue doesn't have.
- **Audit (step 4).** Reads the generated HTML, as a search engine would. It
  checks every page's title, description, canonical, headings, links and
  visible text. It also checks that the structured data matches the page:
  Article headline = H1, HowTo steps = the workflow's steps.
- The **server's `NODE_ENV` must not be `production` locally** if you want the
  demo guide. It loads in development only.
