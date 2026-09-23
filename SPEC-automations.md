# SPEC — Automations library

Status: not started. Written against `docs/CODEBASE-OVERVIEW.md`.

An **automation** is a task-shaped recipe: a natural-language task title,
the tool that does it, a prompt to paste, and what you get back. The
client compiles them in batches of ~15 per niche as spreadsheets.

Source data: ~120 `.xlsx` files in per-niche folders under
`server/scripts/data/` (gitignored). `docs/BATCH-SURVEY.md` is the
survey: 25 niches with data, 6 empty folders, 1,775 rows, 5 header
shapes.

---

## 1. Decisions

| Question | Decision |
| --- | --- |
| Storage | JSON in git, read-only at runtime. Mirror `stories/` exactly. |
| Tool references | Embedded, not catalogue slugs. Most sheet tools aren't in the catalogue. |
| Steps | 3 derived at render time. An optional authored `steps` field overrides. |
| Search | Own lightweight matcher. Not `scoreTool`. |
| Pricing | Never render the raw price. Show a tier label + link to source. |
| Trust score | Stored, not rendered. Ranking tiebreak only. |
| Import | Offline CLI: spreadsheet → validated JSON → commit. |

### Why tools are embedded

`UsageStory` references the catalogue by `toolSlugs`. Automations can't:
Motion, Bold.org, Notability, Cleo, Simplify, Todoist, Notta, Yoodli and
DeepL are none of them in the 68. Requiring catalogue entries would mean
inventing `mono`, `pop`, `roles`, `stages` and an editorial `summary` for
every tool the client names — curation work nobody asked for, on tools
nobody vetted.

So an automation carries its tool inline. An optional `catalogueSlug`
links to a real record when one exists, and the UI shows the richer card
in that case. Adding it later is additive.

### Why not reuse `scoreTool`

It's hard-typed to `Tool` (`score.ts:99,128`) and weighs 13 signals
derived from catalogue fields. Automations have something better: the
client already wrote `Task Title` and `Intent Labels` — the literal
phrases a user would type. Term overlap against those two fields will
beat a 13-signal scorer that has to infer category and stage.
`normalizeQuery` and `stem()` are type-agnostic and get reused.

---

## 1a. Design constraint

This feature is built to the existing visual system. Do not redesign,
restyle, or reorganise anything that already exists.

- No changes to existing pages, components, layouts, navigation, or
  the assistant's UI. If a shared component needs a new capability,
  extend it additively behind an optional prop; never change its
  default appearance.
- New pages compose existing primitives from `components/ui/` and
  `components/layout/`, and use the tokens in `styles/index.css`
  `@theme`. No new colours, fonts, spacing scales, or shadows.
- No new UI dependencies, no animation libraries, no icon sets beyond
  what's already imported.
- Match the structure of an existing comparable page (Browse for the
  list, a detail page for the detail view) rather than inventing a
  new layout language.
- CLAUDE.md's "preserve the Claude-Design visual source of truth"
  applies in full.

If something genuinely can't be built without a visual change, stop
and ask rather than deciding.

## 1b. Two catalogue kinds

The site has two modes, switched by the hero kind tabs: **AI Workflows**
and **MCP Servers**. Every retrieval, plan and match path must respect
the active kind.

- Retrieval takes a `kind` filter ('workflow' | 'mcp'), derived from
  `Tool.isMcpServer`. There is no 'all': an absent kind means no
  filter. 'mcp' keeps only MCP servers; 'workflow' applies no filter,
  because an MCP server is still a workflow tool. The assistant passes the kind of
  the page it's mounted on. A plan built on the MCP Servers tab names
  MCP servers; a plan on Home does not.
- Automations carry the same dimension. The Students batch is
  workflow-side; an MCP batch would be its own. Filter automations by
  kind wherever they're listed or matched.
- Browse and direct search send no kind, so nothing currently
  working changes behaviour.
- One definition of the kind vocabulary, in taxonomy.ts, per the
  boundary test. Do not add a parallel enum.

## 2. Files

```
server/src/automations/
  types.ts          # Automation, AutomationStep, AutomationTool
  schema.ts         # Zod, parseAutomations (throw-collected, like catalogue)
  repository.ts     # AutomationRepository port
  json.ts           # the ONLY module naming automations.json
  data/
    automations.json
  match.ts          # query -> ranked automations
server/src/http/routes/automations.ts
server/scripts/importAutomations.ts   # offline, not part of the server
client/src/pages/AutomationsPage.tsx
client/src/pages/AutomationDetailPage.tsx
client/src/components/automations/
client/src/services/automations.ts
client/src/hooks/useAutomations.ts
client/src/types/automation.ts        # manual mirror, per convention
```

`boundary.test.ts` gets a new content-module block for `automations/`,
matching the `stories/` block: only `json.ts` names the data file, only
`container.ts` calls `createJsonAutomations`, and `automations/` never
imports `catalogue/` or `retrieval/`.

---

## 3. The record

```ts
interface AutomationTool {
  name: string            // "Motion"
  url?: string            // first tool only: the row's Source URL
  catalogueSlug?: string  // set only if a real catalogue record matches
  accessNote?: string     // "7-day trial requires a card upfront"
}

interface AutomationStep {         // authored steps only
  title: string
  body: string
  prompt?: string                  // rendered with a copy button
  toolName?: string
  tip?: string
}

interface Automation {
  id: string
  slug: string                     // from title, unique within a niche
  kind: CatalogueKind              // 'workflow' | 'mcp', §1b
  niche: NicheName                 // vocabulary, §4 — the FOLDER name
  sector?: string                  // the row's Niche/Industry cell
  persona: string                  // free text, from Audience/Persona
  title: string                    // Task Title — the searchable phrase
  intentLabels: string[]           // Intent Labels/Synonyms, split on ';'
  tools: AutomationTool[]
  workflowSummary: string
  samplePrompt: string
  beginnerFriendly: 'yes' | 'somewhat' | 'no'
  beginnerNote?: string            // the cell after the leading word
  trustScore: 1 | 2 | 3 | 4 | 5    // stored, not rendered
  pricingNote: string              // stored, NOT rendered — see §6
  pricingTier: PricingTier         // derived at import, rendered
  sourceUrl: string
  sourceType: string
  freshness: string                // "Retrieved Sep 2026"
  accessNotes?: string
  batch: string                    // "Students Batch 2"
  steps?: AutomationStep[]         // absent today; overrides derivation
  status: 'active' | 'draft'
}
```

`beginnerFriendly` comes from a free-text column ("Yes - guided profile
setup…"). The importer maps the leading word and keeps the rest as
`beginnerNote`; anything unrecognised fails the row.

`sector` keeps the sheet's Niche/Industry cell, which often differs
from the folder ("Small Business Owners (generic)", "Pest control").
The folder is the reliable niche.

`Recommended Tools` often names several tools. The importer splits on
`;` if present, else on `,` outside parentheses, then on ` / `, and
keeps every name. The row has one Source URL and it belongs to the first
tool, so only `tools[0]` has a `url`; later tools are a name (plus
`catalogueSlug` on a confident match) with no link. A later "tool" over
the name cap is dropped — in the data these are prose alternatives, not
names — while an over-long first tool fails the row.

---

## 4. Vocabulary

`taxonomy.ts` is the single source for every closed list
(`boundary.test.ts:132-145`). So `NICHES` goes there:

`NICHES` is the 25 folder names that contain data (per
`docs/BATCH-SURVEY.md`), verbatim. The 6 empty folders (Doctors &
Clinics, Financial Advisors, Insurance Agents, Lawyers & Law Firms,
Local Retail Stores, Nonprofits) are not in it.

Add a niche when a batch arrives. `persona` stays free text — the sheet's
values are full sentences ("College students juggling classes, clubs, and
a part-time job"), not a closed set, and forcing them into one would lose
detail.

Do **not** add automation tags to `TOOL_CATEGORIES` or `ROLES`. Those
describe catalogue tools and the boundary test enforces one definition
per vocabulary.

---

## 5. Derived steps

The client's instruction: three steps for now, perfected automations
later. So derivation happens **at render time and is never stored**:

```
steps ?? deriveSteps(automation)
```

1. **Open the tool** — `tools[0].name`, linked to `url`. Shows
   `accessNote` when present.
2. **Use this prompt** — `samplePrompt`, with a copy button.
3. **What you'll get** — `workflowSummary`.

Step 3 is the weak one: `workflowSummary` describes the process more than
the outcome. That's exactly what an authored `steps` array replaces, so
don't paper over it.

Derivation lives in one pure function, unit-tested, used by the server
when serving detail and by nothing else.

---

## 6. Pricing

Every row in the sheet is flagged *verify before publishing*, and the
README says prices change monthly. So:

- `pricingNote` is stored and **never rendered**.
- The importer derives `pricingTier` (`free` | `freemium` | `paid`) and
  the UI shows "Free" / "Free plan" / "Paid".
- Every price claim links to `sourceUrl`, the vendor's own page.

If the client later wants real prices, that's one render change plus a
verification step in the review flow.

---

## 7. Matching

`match.ts`, independent of `retrieval/`:

```
score = 3.0 * exact phrase hit on title
      + 1.5 * term overlap with title
      + 1.2 * term overlap with intentLabels
      + 0.6 * term overlap with persona
      + 0.5 * term overlap with tool names
      + 0.1 * (trustScore / 5)
```

Weights in `config/limits.ts` as `AUTOMATION_MATCH_WEIGHTS` — never
literals in `match.ts` (`boundary.test.ts` holds `match.ts` to this, as
it does `retrieval/score.ts`).

**Term overlap is IDF-weighted.** Each query term counts by its rarity
across the automations the matcher was built over:

```
idf(t)  = ln((N + idfSmoothing) / (df(t) + idfSmoothing)) + idfBase
overlap = Σ idf of query terms the field contains / Σ idf of all query terms
```

N is the number of automations, df(t) how many contain t in any scored
field; `idfSmoothing` and `idfBase` (both 1) live in `AUTOMATION_MATCH`.
An overlap stays 0–1, so the field weights above keep their meaning;
what changes is which *terms* carry a query. In "follow up with clients
automatically", "follow" is rare and "client"/"automatically" are
common, so follow-up automations now rank first instead of any record
mentioning clients.

**Phrase ties go to the shorter title.** When two records both contain
the whole query in their title, the one with fewer title words ranks
first; score decides only between equal lengths. It is an ordering, not
a weight, and it cannot move a record across the phrase line: a phrase
hit has every query term in its title, so it scores at least 3.0 + 1.5,
more than all other signals give a record without one (3.9).

Trust is a near-tiebreak. It spans at most 0.08, so it decides only
between text matches that close, and a record with no text signal is
never returned on trust alone.

Reuse `stem()` and `STOPWORDS` from `retrieval/normalize.ts` — the one
import from `retrieval/` that `automations/` is allowed, and only in
`match.ts`. Do not reuse `INTENT_MAP`: it maps whole queries onto
catalogue stage/category words, which is the behaviour that broke
"automate client follow-ups".

Filter by `niche` and `kind` when given. Return ranked automations,
capped (`AUTOMATION_MATCH.defaultLimit` 10, `maxLimit` 50).

**Verification** (slice 5): every one of the 1,560 imported titles, run
as a query against the full set, ranks its own automation first.

---

## 8. Import

Offline CLI, same spirit as `review/`: validate, report, write, commit.

```
npm run import:automations -- [<data root>] [--dry-run]
```

Source is `.xlsx`, ~120 files in per-niche folders under
`server/scripts/data/`. SheetJS is a server devDependency, used only by
`server/scripts/importAutomations.ts` and never imported from `src/`.

- The data sheet is the one whose row 1 has a cell matching
  `/task title/i`; sheet order is not assumed.
- Columns are matched by normalized header (lowercase, parentheticals
  dropped, punctuation stripped), which collapses the survey's 5 header
  shapes into one.
- `niche` is the folder name. Rows are deduplicated on (niche,
  normalized title), keeping the first occurrence: later batches repeat
  earlier ones.
- Output is one file per niche: `server/src/automations/data/<niche
  slug>.json`.
- `id` is a hash of niche + normalized title. The sheets carry no stable
  row identity, so editing a title in a source sheet creates a new
  record on the next import rather than updating the old one.

Behaviour:
- Parse rows, validate each against the schema.
- Report per-row failures with row number and field. Partial success is
  fine — write the valid rows, list the rest.
- Derive `slug` (reuse `review/slug.ts`), `pricingTier`,
  `beginnerFriendly`, and split `intentLabels` on `;`, or on `,` when
  the cell has no `;` (38 files use commas).
- Match each tool name against the catalogue; set `catalogueSlug` on a
  confident match, leave it unset otherwise. Never invent a catalogue
  record.
- Re-importing a batch replaces its rows by slug, doesn't duplicate.
- `--dry-run` prints what would be written and writes nothing.

Output is committed to git like the catalogue. That keeps the curated
model: nothing reaches the site without passing through a commit.

---

## 9. Routes and pages

```
GET /api/automations?q=&niche=&limit=     ranked list
GET /api/automations/:slug                one, with derived steps
```

- `/automations` — search box, niche filter, result cards (title,
  persona, tool names, beginner badge, price tier).
- `/automations/:slug` — title, persona, the three steps, the tool
  panel, source and freshness line.

The search box is the product's front door: the user types a task and
gets automations, not tools. Keep it plain — no stage vocabulary, no
jargon, same rules as the plan panel.

---

## 10. Build order

One slice per session, commit each.

1. `types.ts`, `schema.ts`, `NICHES` in taxonomy. No data, no route.
2. Importer + the Students batch. **Verify:** dry-run on all 15 rows,
   then import; every row lands or is reported.
3. `repository.ts`, `json.ts`, container wiring, boundary test block.
4. `deriveSteps` as a pure function, with tests.
5. `match.ts` + weights. **Verify:** run the 15 task titles as queries;
   each should rank its own automation first.
6. Routes. **Verify:** curl before touching the client.
7. Client pages and hooks.

Slice 5's check is the one that matters — if a row's own title doesn't
retrieve it, the matcher is wrong.

---

## 11. Out of scope

- User accounts and saved step progress
- Marking steps complete
- Authored multi-step guides (the field exists; no content yet)
- Images or video per automation
- Rendering trust scores
- Replacing the AI assistant (it keeps recommending tools for now)
- Postgres
