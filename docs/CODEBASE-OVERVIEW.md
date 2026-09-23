# AI Tool Kart — Orientation

Read-only survey. Every structural claim is `file:line`.

## 1. Shape

**server/src** (two levels):
- `assistant/` — turn engine, grounding, refinement, plan schema, prompts (`prompts/`)
- `catalogue/` — Tool port/adapter/schema/taxonomy, seed `data/tools.json`
- `config/` — env parsing, numeric limits/weights
- `domain/` — shared types (`types.ts`), error model (`errors.ts`)
- `http/` — app-level `cors.ts`/`errorHandler.ts`/`requestLogger.ts`/`validate.ts`, `routes/` (one file per resource), `middleware/` (honeypot, rate limit)
- `llm/` — provider abstraction, mock provider, budget/client, marked TEMPORARY (moves to `shared/llm` in Phase H)
- `retrieval/` — normalize → score → select pipeline
- `review/` — CLI for triaging spreadsheet-free submissions (propose/validate/approve)
- `savings/`, `stories/` — two more editorial content stores, same port/adapter/schema/data shape as catalogue
- `submissions/` — the Submit form's writable store
- `utils/` — logger, URL normalizer, version string
- `container.ts` — composition root; `app.ts` — Express wiring; `index.ts` — process entry

**client/src**: `pages/` (one per route) → `components/` (~30 feature folders + `components/ui/` primitives) → `hooks/` (one per resource, e.g. `useTools.ts`) → `services/` (`http.ts` + one file per resource) → `types/` (server-type mirrors) → `data/` (static/editorial arrays) → `styles/` (Tailwind v4 tokens) → `utils/`.

**Scripts**: server `dev`/`start` = `node --watch src/index.ts` (server/package.json:11-12, no strip-types flag); `test`/`review` add `--experimental-strip-types` (package.json:13,16); `typecheck` = `tsc --noEmit` (package.json:14). Client: `dev`=vite, `build`=`tsc -b && vite build` (client/package.json:7-8), no test script. **Node**: `engines.node >=22.5.0` (server/package.json:7-9). On this machine (Node 22.13.1), `dev`/`start` fail with `ERR_UNKNOWN_FILE_EXTENSION` without `--experimental-strip-types` — verified this session; the flag isn't in those two scripts.

## 2. Server architecture

Worked example, `GET /api/tools`: `index.ts` → `createContainer` (container.ts:115) builds `catalogue`/`retrieval` → `app.ts:45` mounts `createApiRouter(container)` → `http/routes/index.ts:41-44` hands `createToolsRouter` its two deps from the container (no route constructs its own) → `routes/tools.ts:101-174` validates query via `parseOrThrow(ListQuerySchema, ...)` (validate.ts:33) → calls `retrieval.rank()` or `catalogue.search()` → `res.json()`.

DI: `container.ts` is the *only* module naming a concrete adapter (mock provider, JSON catalogue/stories/savings) — enforced by `tests/boundary.test.ts` (below).

Schemas: Zod, colocated per domain (`catalogue/schema.ts`, `assistant/schema.ts`, `submissions/schema.ts`). `parseOrThrow` (http/validate.ts:33-48) turns a Zod failure into `ApiError('INVALID_REQUEST', ...)` with `details.fields`.

Error contract: one class, `ApiError` (domain/errors.ts:99), classified by HTTP status; `toErrorResponse` (http/errorHandler.ts:80) maps any throw to `{error:{code,message,details?,fields?}}` — non-`ApiError` and `code:'INTERNAL'/'CONFIG'` always get the fixed `INTERNAL_MESSAGE` (errorHandler.ts:26), never internals. Route handlers always `catch` and `next(error)` (e.g. routes/tools.ts:170).

Logging: `Logger` interface (utils/logger.ts:82), `createLogger` (logger.ts:103), `.child(context)` (logger.ts:88) scopes request id/method/path; secrets registered once and scrubbed from every line (logger.ts:39-54).

## 3. Data layer

| Store | Port | Adapter | File | R/W | Load/index | Invalid record |
|---|---|---|---|---|---|---|
| Catalogue | `catalogue/repository.ts:74` | `catalogue/json.ts:107` | `catalogue/data/tools.json` | read-only | `buildIndexes` at construction, `json.ts:239` | `parseCatalogue` throws, collecting *every* bad record, `catalogue/schema.ts:204-241` |
| Stories | `stories/repository.ts:45` | `stories/json.ts:51` | `stories/data/stories.json` | read-only | sorted by `order` at construction, `json.ts:61` | `parseStories` throws collected errors, `stories/schema.ts:95` |
| Work-savings | `savings/repository.ts` (mirrors stories) | `savings/json.ts:48` | `savings/data/workSavings.json` | read-only | same pattern | same throw-collected pattern |
| Submissions | `submissions/store.ts:18` | `submissions/store.json.ts:61` | `server/data/submissions.json` (mutable, outside `src/`) | **writable** | read on each call, no in-memory index | intake validated by `SubmissionInputSchema` at write (`submissions/service.ts:66-68`), not at load |

All three read-only stores share one shape: port has no storage vocabulary, only the adapter names its filename, and a bad record fails the boot loudly rather than being dropped (same rule catalogue documents at `catalogue/json.ts` header).

## 4. The catalogue

`Tool` (domain/types.ts:48-118): display fields (`id,name,mono,cat,model,tagline,plainLine?,rating,reviews,price,trend,badge,tags,pop,isMcpServer?,api,ctx,team,trial,integr`) plus recommendation fields (`slug,url,summary,roles,useCases,stages,pricingTier,status,verified`) plus intake (`addedAt?`). `ToolSummary` (types.ts:141) is the trimmed projection sent to clients/plans.

Taxonomy (`catalogue/taxonomy.ts`) is the *single* source for every closed list — enforced by boundary.test.ts:132-145 ("the vocabulary has exactly one definition"): `TOOL_CATEGORIES` (taxonomy.ts:41, 10 fixed), `PRICING_TIERS`/`PRICING_MODELS` (141,145, 3/5), `ROLES` (277, 12), `WORKFLOW_STAGES` (433, 10 fixed) + `PLAN_STEP_STAGE_ORDER` (460, a separate display-order permutation), `USE_CASES` (414) — **generated**, not hand-listed: `[...new Set(Object.values(GOALS_BY_ROLE).flat())]` from `GOALS_BY_ROLE` (318).

Adding a vocabulary value end to end: categories/roles/stages are fixed arrays — add the literal (taxonomy.ts), add its keywords to `CATEGORY_KEYWORDS`/`ROLE_KEYWORDS`/`STAGE_DEFINITIONS` (normalize.ts inputs), tag ≥`RETRIEVAL.minPerStage` tools. Use-cases are additive: add a phrase to some role's `GOALS_BY_ROLE` list (`USE_CASES` regenerates), then tag ≥1 active tool — `catalogue.test.ts` asserts every use-case is covered (verified this session adding "Follow up with clients").

## 5. Search and retrieval

`normalizeQuery` (retrieval/normalize.ts:469) → `scoreTool` (score.ts:128) per candidate → `selectCandidates` (select.ts:68, rank + stage-coverage reservation + cap). Weights, all in `SCORE_WEIGHTS` (config/limits.ts:77, never a literal in score.ts — boundary.test.ts:147-158): `nameExact 3.0, nameToken 1.2, category 2.0, tagOverlap 1.5, textOverlap 1.0, role 0.8, stage 0.6, useCase 0.9, popularity 0.4, rating 0.2, pricingMismatch -2.0, verified 0.15, confirmed 0.7`.

`INTENT_MAP` (whole-query shortcuts) and `STOPWORDS`/`TERM_SYNONYMS`/`stem()` all live in `retrieval/normalize.ts:51-214`. Caller gets `RetrievalResult{candidates: ScoredTool[], interpretation, coverage, unmetStages, considered}` from `retrieve()` (service.ts:129), or a plain ranked `Tool[]` from `rank()` (service.ts:163, used by the browse endpoint).

To search a different record type: `scoreTool`/`indexTool` are hard-typed to `Tool` (score.ts:99,128) — would need a parallel indexer/scorer, or a generic rewrite. `selectCandidates`/`normalizeQuery` are type-agnostic already.

## 6. The assistant

`runTurn` (assistant/engine.ts:115): merge context → `refineContext` → `retrieval.retrieve()` → empty? clarify without calling the model (§9) → build `ToolCard[]` (now carries `score`) → LLM call against `AssistantReplySchema` → `groundReply` (ground.ts:84, checks every id against the candidate set, filters/degrades, does no IO — boundary.test.ts:547-550) → hydrate via `catalogue.findManyByIds` → `AssistantChatResponse`.

Plan shape: `AssistantPlanStep{action, tool, alsoGood}` (domain/types.ts, hydrated) built from `AssistantStepSchema{stage,toolId,alsoGoodToolIds}` (assistant/schema.ts:64) — model output, `.strict()` throughout, caps read from `ASSISTANT.*` never literals (boundary.test.ts:535-545).

Provider interface: `LLMProvider{id, modelFor(class), complete(request)}` (llm/provider.ts:85). Registering a real one: write an adapter implementing that interface, register it in `PROVIDER_FACTORIES` (llm/factory.ts:63) — "nothing else changes" (factory.ts:34). Today only `'mock'` is registered; no vendor SDK may appear anywhere (boundary.test.ts:444-453).

## 7. Client architecture

Routes: flat table in `App.tsx:23-48` (react-router), most nested under a `PageShell`.

Data fetching: `apiRequest<T>()` (services/http.ts:110-146, base URL from `VITE_API_URL`, http.ts:18-22) is the only fetch call; one service module per resource wraps it (e.g. `services/tools.ts`); one hook per resource owns loading/error/abort state (`hooks/useTools.ts:62-175` → `services/tools.ts:91-94` → `GET /api/tools`).

Type mirroring: manual, comment-documented, never generated — `client/src/types/tool.ts:4-8` states it mirrors server `ApiTool` field-for-field and "if the two ever disagree, this file is the one that is wrong"; same pattern in `types/assistant.ts`.

Styling: Tailwind v4, CSS-first tokens in `styles/index.css:19` `@theme` block (colors from :33). Convention: named token utilities + arbitrary-value Tailwind for one-offs, composed from shared primitives (`components/ui/`, `components/layout/Section`) — see `pages/NotFoundPage.tsx:14-24`.

## 8. Conventions and guardrails

CLAUDE.md mandates (project root): frontend = React/TS/Vite/Tailwind only; backend = Node/Express/TS/Postgres/Prisma when it starts; preserve the Claude-Design visual source of truth; reusable components over one giant `App.tsx`; avoid `any`; ask before adding a dependency; no destructive git ops; design accuracy and frontend architecture take priority over new features right now.

`tests/boundary.test.ts` (551 lines) mechanically enforces, per content module (catalogue/stories/savings/llm/assistant): only its own `json.ts` may name its data file; nothing outside it imports its `data/` dir or its concrete `createJson*` factory except `container.ts`; one-way references only (stories/savings never import the catalogue and vice versa); `retrieval/` touches no filesystem; routes never import a JSON adapter directly; `llm/` never imports `catalogue|retrieval|http|express` and never throws `ApiError`; `assistant/` never imports `express|http` and reaches the catalogue only through its port; scoring weights and plan caps are never numeric literals in logic files.

Test fixtures: `tests/helpers.ts` — `makeTool()` (115), `fixtureCatalogue()` (158), `makeAssistantReply()`, `testLogger()`/`testEnv()` — every test builds fixtures through these rather than hand-rolling records, so a schema change breaks one function, not fifteen literals.

## 9. State of play

Branch `main`, 8 commits ahead this session (retrieval/assistant fixes, all green: 943/943 server tests, clean typecheck both sides).

Uncommitted (pre-existing, not from this session): a half-built **MCP Servers directory** feature — `client/src/pages/McpServersPage.tsx` + `components/catalogue/McpToolSection.tsx` (untracked), a new `/mcp-servers` route (`App.tsx`), a `MCP_SERVERS_ROUTE` constant and hero kind-tab switch (`data/navigation.ts`, `data/hero.ts`), supporting tweaks to `KindTabs`/`HomePage`/`AssistantStage`/etc., and `Tool.isMcpServer` flags + a new `github` record added to `catalogue/data/tools.json`. `SPEC-submit-backend.md` is also untracked.

No failing tests; nothing else half-built that touches retrieval/assistant.

## 10. For the new feature

**Reuse as-is**: the container/port/adapter/schema pattern (mirror `stories/` — one-way slug reference to the catalogue, no arithmetic-style content guard, its own `boundary.test.ts` block); `parseOrThrow`+`ApiError` for a new route; `tests/helpers.ts`-style fixture builders; `WORKFLOW_STAGES`/`TOOL_CATEGORIES` if steps/recipes tag by stage or category.

**Needs extending**: `UsageStory` is the closest existing shape but is flat (`toolSlugs: string[]`, no ordered steps/instructions) — an automation needs something closer to `AssistantPlan{steps:[{action,tool}]}`'s shape, as a new schema/type, not a UsageStory field addition. Nothing here does spreadsheet/CSV import — closest precedent is `submissions/service.ts`'s single-record Zod-validate-then-store flow and `review/` 's propose→validate→approve CLI pattern; a bulk importer is new plumbing (per-row validation, partial-success reporting).

**Would fight it**: `score.ts`/`indexTool` are hard-typed to `Tool` (score.ts:99,128) — ranking automations themselves through retrieval would need a parallel scorer, not a generic one; `taxonomy.ts`'s single-vocabulary rule (enforced by test) means automation-specific tags can't be a quiet parallel list; `AssistantPlanStep.tool: ToolSummary` and grounding's candidate-id checking are retrieval-candidate-specific, not reusable for validating an imported recipe's tool references without new code.
