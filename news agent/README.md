# AI Tool Kart — News Agent

Server-side pipeline that discovers AI news, verifies it against primary
sources, drafts an article, and creates a **WordPress draft** for a human to
review and publish.

Architecture and rationale live in [`../NEWS_AGENT.md`](../NEWS_AGENT.md). Read
that first — this file is only how to run it.

```text
sources → ingest → dedupe → classify → evidence → verify → write → edit → WP draft
```

## Status

Phases A–G of NEWS_AGENT.md §32 are implemented. **Not** implemented, by design:

- production scheduling (Phase H) — the agent runs on demand
- automatic publishing (Phase I) — every post is created as a draft, and the
  agent refuses to start if `AGENT_AUTO_PUBLISH=true`
- featured images (§21)

## Requirements

Node **≥ 22.5** (uses the built-in `node:sqlite` and `node:test`). Developed on
Node 26, where TypeScript runs directly with no build step.

## Setup

```bash
cd agent
npm install
cp .env.example .env     # then fill it in — .env is gitignored
```

The agent runs with no configuration at all: `LLM_PROVIDER` defaults to `mock`
and WordPress is optional. Without either, the whole pipeline still executes and
stops just short of publishing.

## Running

```bash
npm run agent                        # one full pipeline cycle, then exit
npm run agent -- --dry-run           # everything except WordPress writes
npm run agent -- --source=openai-news --limit=1
npm run agent -- --sources           # list the source registry
npm run agent -- --inspect-db        # recent runs, pending drafts, published posts
npm run agent -- --verbose           # debug logging
npm run agent -- --log-format=json   # structured logs for production
```

One invocation is one run. Exit code is `0` for a completed or skipped run —
including one where every story was rejected, which is a normal outcome — and
`1` only when the run itself failed.

Concurrent runs are prevented by a database lock. A crashed run's lock is
reclaimed automatically after `AGENT_RUN_LOCK_STALE_MINUTES`.

## Checks

```bash
npm run typecheck
npm test        # offline: fixtures and mocks only, no network, no LLM, no CMS
npm run build   # emits dist/ for deployment
```

## Activating a real LLM

No production provider has been chosen (NEWS_AGENT.md §37), so no vendor adapter
ships. To add one:

1. Create `src/llm/providers/<vendor>.ts` implementing `LLMProvider` — the
   contract is documented at the top of `src/llm/factory.ts`.
2. Register it in `PROVIDER_FACTORIES` in that file.
3. Set `LLM_PROVIDER=<vendor>` and `LLM_API_KEY` in `.env`.

Schema validation, repair retries, budget accounting and logging are shared, so
an adapter only has to turn a prompt into text. The one rule it must honour:
`request.system` and `request.input` stay separate, because `input` carries
untrusted source text.

Start small — `npm run agent -- --dry-run --limit=1` — before letting it run
against the full source list.

## Activating WordPress

1. Create a dedicated WordPress user (e.g. `aitoolkart-news-agent`) with the
   **Author** role. Not an administrator.
2. Generate an Application Password for that user (Users → Profile → Application
   Passwords).
3. Set `WORDPRESS_API_URL`, `WORDPRESS_USERNAME` and `WORDPRESS_APP_PASSWORD`.

WordPress disables Application Passwords on non-HTTPS sites by default, so a
plain-HTTP LocalWP instance needs either HTTPS enabled or a documented local
override. The agent accepts `http://` only for loopback/`.local` hosts, and warns
when it does.

## Layout

| Directory | Responsibility |
|---|---|
| `src/config/` | environment, editorial scope, weights and caps |
| `src/sources/` | the source registry — the only place feed URLs live |
| `src/ingestion/` | fetch, parse, normalize to `NewsItem` |
| `src/dedupe/` | URL canonicalization, title similarity, story clustering |
| `src/ranking/` | deterministic prefilters and weighted scoring |
| `src/evidence/` | evidence retrieval, text extraction, claim extraction |
| `src/verification/` | claim support and tier rules |
| `src/llm/` | provider abstraction, schemas, prompts, budget |
| `src/generation/` | slug, structured draft, allowlisted HTML renderer |
| `src/editorial/` | the Editor pass and approval policy |
| `src/wordpress/` | authenticated REST client, taxonomy, publishing |
| `src/storage/` | SQLite — the only SQL in the codebase |
| `src/pipeline/` | run orchestration and locking |

## Boundaries

This package is independent of `client/`. It does not import from it, share its
path alias, or add dependencies to it. React reads published posts from
WordPress and cannot tell whether a human or the agent wrote them — keeping that
true is the point.

Secrets are server-side only. Nothing here may ever carry a `VITE_` prefix; that
prefix compiles a value into the public browser bundle.
