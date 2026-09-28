# Guide editorial content

Hand-written content for individual guide pages (`/automations/:niche/:slug`).

Every guide works without a file here — it falls back to the imported record and
the three generated steps. Add a file only when a person has written real
content for that guide.

## Why here and not in `../data/`

`../data/*.json` is rewritten wholesale by `npm run import:automations`. Anything
written there would be erased by the next import. Files in this folder are never
touched by the importer and are merged onto the imported record when the server
starts (`../editorial.ts`).

## Adding content for one guide

1. Find the guide's record in `../data/<niche>.json` and copy its `id`
   (e.g. `"accountants-bookkeepers-35e43d4c1d"`). The id — not the slug — is
   the key, because it survives a title edit on re-import.
2. Create `<niche>--<slug>.json` in this folder (the name is for humans; only
   `automationId` matters).
3. Write only the fields you have real content for. Every field is optional.
4. Restart the server. A typo, an unknown field, an id that matches no record or
   a related guide that does not exist stops the boot with the file and field
   named — nothing is dropped silently.

```jsonc
{
  "automationId": "accountants-bookkeepers-35e43d4c1d",

  "intro": ["Paragraph one.", "Paragraph two."],
  "learningOutcomes": ["A concrete outcome"],
  "beforeYouStart": [
    { "title": "A QuickBooks Online account", "description": "…",
      "resource": { "title": "…", "url": "https://…", "kind": "reference" } }
  ],

  // When present, these REPLACE the three generated steps. Order = array order.
  "steps": [
    {
      "title": "Connect the bank feed",            // required
      "body": "One-sentence description.",        // required
      "instructions": ["Do this", "Then this"],
      "tools": [{ "name": "Booke AI", "url": "https://…", "catalogueSlug": "…",
                  "why": "Why this tool for this step" }],
      "prompt": "Copyable prompt text",
      "expectedOutcome": "What the reader has when the step is done",
      "tips": ["…"],
      "resources": [{ "title": "…", "url": "https://…", "kind": "template" }],
      "cta": { "label": "Open the template", "url": "https://…" },
      "alternatives": [{ "name": "Another tool", "why": "…" }]
    }
  ],

  "tips": ["Guide-level tip"],
  "commonIssues": [{ "problem": "…", "solution": "…" }],
  "resources": [{ "title": "…", "url": "https://…", "kind": "checklist", "description": "…" }],

  // Shown first; the page fills the rest from the same niche.
  "relatedGuides": [{ "niche": "Accountants & Bookkeepers", "slug": "…" }]
}
```

Resource `kind` is one of `prompt`, `template`, `example`, `tutorial`,
`reference` or `checklist`. Empty lists are rejected — leave the field out
instead. The full schema is `AutomationEditorialSchema` in `../schema.ts`.

A complete worked example lives in `../demo/editorial/` (loaded in development
only).
