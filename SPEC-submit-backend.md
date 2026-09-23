# SPEC — Submit backend (storage-agnostic)

Status: not started. This spec covers the intake endpoint for the Submit
page. The database decision is deliberately deferred — all persistence
goes through one interface with a JSON-file implementation. Swapping to
Postgres later should touch exactly one file.

Current state this builds on:
- `client/src/pages/SubmitPage.tsx` — form complete, `handleSubmit` is a
  900ms `setTimeout`, nothing is persisted.
- `client/src/types/submit.ts` — `SubmitFormState` (14 fields),
  `isSubmissionReady` (7 required), length constants.
- Server is Express, catalogue served from JSON via
  `server/src/catalogue/json.ts`. No database driver, no ORM, no
  migrations anywhere in the repo.

---

## 1. Decisions

| Question | Decision |
| --- | --- |
| Storage | JSON file now, behind a `SubmissionStore` interface. Postgres later. |
| Where submissions land | A pending queue. Never straight into the live catalogue. |
| Auth | None. Anonymous submissions allowed. |
| Abuse control | IP rate limit + honeypot field. |
| Review | Manual, out of band for now. No admin UI in this spec. |
| Validation source of truth | Server. The client keeps its own checks for UX only. |

---

## 2. Files to create

```
server/
  data/
    submissions.json          # the store, gitignored
  src/
    submissions/
      types.ts                # Submission, NewSubmission
      schema.ts               # zod — canonical validation
      normalizeUrl.ts         # URL canonicalization
      store.ts                # SubmissionStore interface + factory
      store.json.ts           # JSON-file implementation
      service.ts              # orchestration: validate → dupe → create
    http/
      routes/
        submissions.ts        # the route
      middleware/
        rateLimit.ts          # generic, reusable
```

`server/data/submissions.json` goes in `.gitignore`. Commit a
`submissions.example.json` containing `[]` so a fresh clone works.

---

## 3. The storage interface

This is the whole point of the deferral. Nothing outside
`store.json.ts` may know that storage is a file.

```ts
// server/src/submissions/store.ts
export interface SubmissionStore {
  create(input: NewSubmission): Promise<Submission>
  findByNormalizedUrl(url: string): Promise<Submission | null>
  list(opts?: { status?: SubmissionStatus; limit?: number }): Promise<Submission[]>
}

export function createSubmissionStore(): SubmissionStore {
  // Reads a config value. Today only 'json' is implemented.
  // Adding 'postgres' later means adding one case here and one new file.
  return createJsonSubmissionStore(SUBMISSIONS_FILE)
}
```

Rules:
- All methods are async, even though the JSON one could be sync. A
  Postgres implementation will be async, and the callers must already
  be written for it.
- No method leaks a file path, a `fs` error, or a row shape. Errors
  thrown are domain errors, not `ENOENT`.
- The service layer and the route import `SubmissionStore`, never
  `store.json`.

### JSON implementation notes

- Read-modify-write the whole array on `create`. Fine at this scale.
- **Serialize all writes** through a single promise chain held in
  module scope. Two concurrent requests doing read-modify-write on the
  same file will silently drop one submission otherwise. This is the
  one real hazard of the JSON approach and it must be handled.
- Write to a temp file then `rename` so a crash mid-write can't leave
  truncated JSON.
- If the file is missing, treat it as `[]` and create it on first write.

---

## 4. The record

```ts
type SubmissionStatus = 'pending' | 'approved' | 'rejected'

interface Submission {
  id: string                 // nanoid or crypto.randomUUID()
  status: SubmissionStatus   // always 'pending' on create
  createdAt: string          // ISO 8601

  siteUrl: string            // as submitted, trimmed
  normalizedUrl: string      // see §5 — what dupe checks compare
  name: string
  tagline: string
  description: string
  category: string
  pricingModel: string
  price?: string
  tags: string[]
  audience?: string
  alternatives: string[]
  faqs: { question: string; answer: string }[]
  launchStory?: string
  plan: 'free' | 'featured'
  launchWeekId: string       // local-date string, see launchWeeks.ts

  submittedFromIp?: string   // for abuse review; see §9
}
```

`status`, `id`, `createdAt`, `normalizedUrl` and `submittedFromIp` are
set server-side and must be **ignored** if present in the request body.

---

## 5. URL normalization

Used for the duplicate check only. The original `siteUrl` is stored
untouched.

Steps, in order:
1. Trim.
2. Parse with `new URL()`. If it throws, validation has already
   rejected it — this function may assume a valid URL.
3. Lowercase the hostname.
4. Strip a leading `www.`.
5. Drop the protocol entirely from the comparison key (so `http` and
   `https` collide — you don't want both listed).
6. Drop the fragment.
7. Drop `utm_*`, `ref`, `fbclid`, `gclid` query params. Keep others.
8. Strip a trailing slash from the path. An empty path becomes ``.

`https://WWW.Example.com/?utm_source=x#top` → `example.com`

---

## 6. Validation

Canonical zod schema in `server/src/submissions/schema.ts`. Mirrors the
client constants, which stay where they are.

| Field | Rule |
| --- | --- |
| siteUrl | required, valid URL, `http`/`https` only, max 2048 |
| name | required, trimmed, 1–80 |
| tagline | required, trimmed, 1–80 |
| description | required, trimmed, 1–2000 |
| category | required, **must be a member of the live taxonomy** |
| pricingModel | required, **must be a member of the live taxonomy** |
| price | optional, max 80 |
| tags | array, max 6, each 1–40 |
| audience | optional, max 200 |
| alternatives | array, max 6, each 1–80 |
| faqs | array, max 5, each `{ question: 1–200, answer: 1–1000 }` |
| launchStory | optional, max 600 |
| plan | enum `free` \| `featured` |
| launchWeekId | required, matches `YYYY-MM-DD` |

Notes:
- Category and pricing membership is the thing the client genuinely
  cannot enforce — its `as ToolCategoryName` cast is erased at runtime.
  Read the allowed values from the same taxonomy source the catalogue
  uses (`server/src/catalogue/taxonomy.ts`).
- `.strict()` on the object so unknown keys are rejected rather than
  silently stored.
- Reject `localhost`, `127.0.0.1`, and private ranges in `siteUrl`.
  Nothing fetches the URL yet, so this is not an SSRF fix — it is just
  garbage rejection. When metadata fetching is added later, real SSRF
  protection belongs at the fetch site, not here.

### On the duplication

The client and server will each hold their own copy of these rules.
That is accepted for now. Do **not** try to import across the
`client/`–`server/` boundary without a proper shared package; a half-
working path alias is worse than an honest duplicate.

If it drifts and starts causing bugs, the fix is a `shared/` workspace
at the repo root with its own `package.json`, referenced by both
tsconfigs. Out of scope here.

---

## 7. The route

`POST /api/submissions`

Order of operations — do not reorder:

1. Rate limit check. → 429
2. Honeypot check (§9). → 201 with a fake id, silently discarded.
3. Zod parse. → 400
4. Normalize URL.
5. Duplicate check against the submission store. → 409
6. Duplicate check against the live catalogue (the JSON catalogue also
   has URLs). → 409
7. `store.create()`. → 201
8. Any throw → 500, logged server-side, no internals in the response.

### Responses

```
201  { id, status: "pending", createdAt }

400  { error: "validation_failed",
       fields: { tagline: "Must be 80 characters or fewer", ... } }

409  { error: "duplicate_url",
       message: "That site has already been submitted." }

429  { error: "rate_limited", retryAfter: 3600 }

500  { error: "server_error" }
```

`fields` is keyed by the client's field names so the form can attach
each message to the right input. This matters — it is what makes
error states useful rather than a generic red banner.

---

## 8. Client wiring

Changes to `client/src/pages/SubmitPage.tsx` and friends:

- `SubmitStatus` becomes `'editing' | 'submitting' | 'done' | 'error'`.
- `handleSubmit` posts the snapshot (`submittedForm`, already captured
  in Batch 1) rather than live `form`.
- Add an `errors` state keyed by field name. Populate from a 400's
  `fields`. Pass down so each `FormField` can render its own message,
  associated via `aria-describedby` — this also closes audit item 4.
- A 409 shows a message on the URL field specifically, not a banner.
- A 429 and a 500 show a retryable banner near the submit button.
- A network throw (offline, server down) is the same as a 500 in the UI.
- `AbortController` with a timeout so a hung request doesn't leave the
  button spinning forever.
- On failure, status returns to `'editing'` with the form intact. Never
  clear the form on error.

---

## 9. Abuse control

**Rate limit** — `server/src/http/middleware/rateLimit.ts`, in-memory
`Map<ip, timestamps[]>`. 5 submissions per IP per hour. In-memory is
fine for a single instance; note in a comment that it resets on restart
and does not work across replicas.

**Honeypot** — add a visually hidden, `tabIndex={-1}`,
`autoComplete="off"` text input to the form named something plausible
like `company`. Real users never fill it. If it is non-empty, return
201 with a generated id and store nothing. Do not return an error —
that tells the bot what happened.

**Record the IP** on each submission for later review. Note that this
is personal data; if you add a privacy policy, mention it.

---

## 10. Build order

One slice per session. Commit after each. Do not start the next until
the current one is verified.

1. `types.ts` + `normalizeUrl.ts`. Pure functions, no I/O.
   **Verify:** a few assertions on normalizeUrl in a scratch script —
   the `WWW`/`utm`/trailing-slash cases from §5.
2. `store.ts` + `store.json.ts`. No route yet.
   **Verify:** a scratch script that calls `create` twice concurrently
   (`Promise.all`) and confirms both land. If one vanishes, the write
   serialization is wrong.
3. `schema.ts`. Taxonomy membership included.
   **Verify:** parse a valid payload and six invalid ones.
4. `service.ts` + the route, mounted.
   **Verify:** curl, §11.
5. `rateLimit.ts`, applied to the route.
   **Verify:** six rapid curls, the sixth returns 429.
6. Client wiring + error states.
7. Honeypot, both ends.

---

## 11. curl checks before touching the client

Run every one of these and confirm the status code before slice 6.

```bash
# 201
curl -i -X POST localhost:PORT/api/submissions \
  -H 'content-type: application/json' \
  -d '{"siteUrl":"https://example.com","name":"Test","tagline":"A test",
       "description":"Testing","category":"<real one>","pricingModel":"<real one>",
       "tags":[],"alternatives":[],"faqs":[],"plan":"free","launchWeekId":"2026-11-16"}'

# 409 — same payload again
# 409 — same site as https://WWW.Example.com/?utm_source=x
# 400 — drop "name"
# 400 — tagline of 200 characters
# 400 — "category":"notarealcategory"
# 400 — "siteUrl":"asdf"
# 400 — extra key "status":"approved"   (strict mode must reject it)
```

The last one matters: if a client can set `status`, anyone can
self-approve into the catalogue.

---

## 12. Out of scope

Deliberately not in this spec, listed so they don't creep in:

- Postgres migration
- Admin review UI
- URL metadata fetch / favicon extraction / prefill
- Email notification on submit
- Real launch-week capacity counting
- Accounts and ownership of a listing
