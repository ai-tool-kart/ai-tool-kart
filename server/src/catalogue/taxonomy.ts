/*
 * The catalogue vocabulary — configuration, not code.
 *
 * This module is the SINGLE source of truth for every closed list the catalogue,
 * the retrieval layer and the API speak in. Nothing else in the server may
 * define one of these lists (ASSISTANT_ARCHITECTURE_PLAN.md §5.3), the same rule
 * news agent/src/config/editorial.ts holds for its beat vocabulary.
 *
 * ── Why this file lives under catalogue/ but is not a storage detail ──────────
 *
 * The boundary rule in §6.1 is about STORAGE: nothing outside catalogue/ may
 * know a JSON file exists. Vocabulary is not storage — a PostgreSQL adapter
 * would validate against exactly these lists. So domain/types.ts imports the
 * vocabulary types from here, and the grep guard is on `tools.json`, not on this
 * module.
 *
 * ── The three vocabularies that were reconciled ───────────────────────────────
 *
 * Three competing category systems and two pricing systems existed across the
 * codebase and the design handoff. §5.3 settles them:
 *
 *   - ToolCategoryName (the ten-value React union in client/src/types/tool.ts)
 *     is the ONLY tool category vocabulary.
 *   - SETUP_CATS / EXPLORE_CATS ("Writing & Content", "Coding & Dev", …) are
 *     demoted to a setup DISPLAY GROUPING. They are not a second taxonomy, so
 *     they are expressed here as a mapping onto the ten real categories.
 *   - pricingTier (free/freemium/paid) is the parseable field used by filtering
 *     and scoring. PricingModel stays as the display and filter-chip vocabulary.
 *
 * ── Workflow stages ───────────────────────────────────────────────────────────
 *
 * The one genuinely new vocabulary. The design's REC_PRESETS name stages
 * ad hoc per preset — "UI design", "Copywriting", "Wiring", "Go-to-market" —
 * which cannot be validated or scored against. The closed ten below normalise
 * them, and tests/catalogue.test.ts proves every one has enough active tools to
 * build a real step out of.
 */

/* ─── Tool categories ──────────────────────────────────────────────────────── */

export const TOOL_CATEGORIES = [
  'Writing',
  'Image',
  'Code',
  'Video',
  'Audio',
  'Agents',
  'Data',
  'Design',
  'Research',
  'Marketing',
] as const

export type ToolCategoryName = (typeof TOOL_CATEGORIES)[number]

/**
 * Query keywords that imply a category.
 *
 * Deliberately generous: a false positive costs a small scoring nudge, a false
 * negative costs the right tool never surfacing. The category signal is one term
 * among several, never a hard filter (see retrieval/service.ts).
 */
export const CATEGORY_KEYWORDS: Record<ToolCategoryName, readonly string[]> = {
  Writing: [
    'writing', 'write', 'writer', 'copy', 'copywriting', 'blog', 'article', 'essay',
    'content', 'draft', 'prose', 'grammar', 'proofread', 'rewrite', 'paraphrase',
    'summarize', 'summarise', 'summary', 'newsletter', 'tone', 'wording', 'text',
  ],
  Image: [
    'image', 'photo', 'picture', 'illustration', 'logo', 'art', 'artwork',
    'thumbnail', 'background', 'headshot', 'visual', 'render', 'photography',
    'product shot', 'upscale',
  ],
  Code: [
    'code', 'coding', 'program', 'programming', 'developer', 'dev', 'engineering',
    'api', 'apis', 'debug', 'debugging', 'refactor', 'repo', 'repository',
    'frontend', 'backend', 'react', 'python', 'javascript', 'typescript',
    'software', 'endpoint', 'unit test', 'compile', 'bug',
  ],
  Video: [
    'video', 'footage', 'clip', 'shorts', 'reels', 'youtube', 'tiktok', 'film',
    'b-roll', 'broll', 'caption', 'subtitle', 'timeline', 'montage', 'vlog',
    'avatar', 'screencast',
  ],
  Audio: [
    'audio', 'voice', 'voiceover', 'narration', 'speech', 'podcast', 'music',
    'song', 'sound', 'transcribe', 'transcription', 'transcript', 'dub',
    'dubbing', 'mix', 'tts',
  ],
  Agents: [
    'agent', 'assistant', 'chatbot', 'chat', 'automate', 'automation', 'workflow',
    'integrate', 'integration', 'trigger', 'zap', 'bot', 'copilot', 'repetitive',
  ],
  Data: [
    'data', 'dataset', 'analytics', 'dashboard', 'sql', 'spreadsheet', 'chart',
    'metric', 'metrics', 'bi', 'query', 'notebook', 'pivot', 'csv', 'statistics',
    'visualisation', 'visualization',
  ],
  Design: [
    'design', 'ui', 'ux', 'wireframe', 'prototype', 'mockup', 'layout', 'brand',
    'branding', 'figma', 'presentation', 'slide', 'deck', 'poster', 'banner',
    'typography', 'palette', 'icon', 'flyer', 'user flow',
  ],
  Research: [
    'research', 'paper', 'literature', 'citation', 'cite', 'study', 'academic',
    'source', 'evidence', 'survey', 'competitor', 'market', 'scholar', 'thesis',
    'reference', 'fact-check',
  ],
  Marketing: [
    'marketing', 'seo', 'ads', 'ad', 'advert', 'campaign', 'social', 'audience',
    'email', 'outreach', 'lead', 'leads', 'growth', 'promotion', 'keyword',
    'funnel', 'crm', 'newsletter', 'engagement', 'prospect',
  ],
}

/**
 * The design's setup/explore category chips, mapped onto the real taxonomy.
 *
 * Demoted per §5.3: this is a display grouping the setup builder renders, and
 * the ONLY sanctioned way to translate one of those labels into tool categories.
 */
export const SETUP_CATEGORY_GROUPS: ReadonlyArray<{
  readonly label: string
  readonly categories: readonly ToolCategoryName[]
}> = [
  { label: 'Writing & Content', categories: ['Writing'] },
  { label: 'Coding & Dev', categories: ['Code'] },
  { label: 'Image Generation', categories: ['Image'] },
  { label: 'Video', categories: ['Video'] },
  { label: 'Audio & Voice', categories: ['Audio'] },
  { label: 'SEO & Marketing', categories: ['Marketing'] },
  { label: 'Research', categories: ['Research'] },
  { label: 'Design', categories: ['Design'] },
  { label: 'Assistants', categories: ['Agents'] },
  { label: 'Business', categories: ['Data', 'Agents'] },
]

/* ─── Pricing ──────────────────────────────────────────────────────────────── */

/** Parseable pricing. Used by filtering, scoring and budget constraints. */
export const PRICING_TIERS = ['free', 'freemium', 'paid'] as const
export type PricingTier = (typeof PRICING_TIERS)[number]

/** Display / filter-chip vocabulary, unchanged from client/src/types/tool.ts. */
export const PRICING_MODELS = [
  'Free',
  'Freemium',
  'Subscription',
  'Credits',
  'Usage-based',
] as const
export type PricingModel = (typeof PRICING_MODELS)[number]

/**
 * Which display models are legal for a given parseable tier.
 *
 * Enforced by the catalogue schema. Without it the two vocabularies drift and a
 * record can claim `pricingTier: 'free'` while its chip reads "Subscription" —
 * which is exactly the class of inconsistency §5.3 exists to prevent.
 */
export const PRICING_MODELS_BY_TIER: Record<PricingTier, readonly PricingModel[]> = {
  free: ['Free'],
  freemium: ['Freemium'],
  paid: ['Subscription', 'Credits', 'Usage-based'],
}

/**
 * What a budget word stated in prose actually permits.
 *
 * Someone who says "free tools for X" means "I do not want to pay to start",
 * and a freemium tool satisfies that. Scoring "free" as strictly `free` put a
 * -2.0 mismatch on Claude, Canva and every other tool with a real free tier —
 * penalising almost the entire catalogue and inverting the ranking the user
 * asked for.
 *
 * This expansion applies ONLY to tiers INFERRED from prose. A pricing filter the
 * caller passes explicitly (a filter chip, an API query parameter) stays exact,
 * because there the user picked the value themselves.
 */
export const PRICING_CONSTRAINT_EXPANSION: Record<PricingTier, readonly PricingTier[]> = {
  free: ['free', 'freemium'],
  freemium: ['free', 'freemium'],
  paid: ['paid'],
}

/**
 * Query keywords that imply a budget constraint.
 *
 * Phase F added the negated forms. "I don't want paid tools" states the same
 * constraint as "free tools only" and, before they were listed, inferred
 * nothing at all — the word "paid" is not itself a `paid` keyword, so the
 * sentence read as neutral and the constraint silently did not exist.
 */
export const PRICING_KEYWORDS: Record<PricingTier, readonly string[]> = {
  free: [
    'free', 'no budget', 'zero budget', 'without paying', 'no cost', 'gratis',
    'free only', 'only free', 'no paid', 'not paid', 'nothing paid', 'avoid paid',
    'no subscription', 'without paying for',
    "don't want paid", 'do not want paid', 'dont want paid',
    "don't want to pay", 'do not want to pay', "don't want any paid",
  ],
  freemium: ['free tier', 'free plan', 'try before', 'freemium'],
  paid: ['premium', 'enterprise', 'professional plan'],
}

/**
 * Phrases that RELEASE a budget constraint rather than imposing one.
 *
 * A conversation moves in both directions: turn two says "free tools only" and
 * turn four says "actually, budget is not an issue". Without these, a constraint
 * could be added but never withdrawn, and the assistant would keep filtering out
 * the paid tools the user just asked for — a bug the user cannot talk their way
 * out of, which is the worst kind.
 *
 * These are matched BEFORE the constraint keywords above, so "paid is fine"
 * clears rather than sets.
 */
export const PRICING_RELEASE_KEYWORDS: readonly string[] = [
  'budget is not an issue',
  'budget is no issue',
  "budget doesn't matter",
  'budget does not matter',
  'budget is fine',
  'paid is fine',
  'paid is ok',
  'paid is okay',
  'paid tools are fine',
  'happy to pay',
  'willing to pay',
  'can pay',
  'money is no object',
  "price doesn't matter",
  'price does not matter',
  "cost doesn't matter",
  'cost does not matter',
  'any price',
]

/**
 * The role a category implies when the user never named one.
 *
 * "I build React websites" says nothing that ROLE_KEYWORDS recognises, but it
 * says Code unambiguously — and a Developer is who asks for Code tools. This is
 * a WEAK inference and the assistant treats it as one: a role the user actually
 * stated always wins, and a category-derived role is only ever used to fill a
 * gap (server/src/assistant/refine.ts).
 *
 * Agents has no entry on purpose. "I want to automate things" is said by every
 * role in this list, so guessing one would be worse than leaving it unset.
 */
export const CATEGORY_ROLE_AFFINITY: Partial<Record<ToolCategoryName, RoleName>> = {
  Code: 'Developer',
  Design: 'UI/UX Designer',
  Image: 'Graphic Designer',
  Video: 'Video Editor',
  Audio: 'Content Creator',
  Writing: 'Writer',
  Research: 'Researcher',
  Marketing: 'Marketer',
  Data: 'Data Analyst',
}

/* ─── Status ───────────────────────────────────────────────────────────────── */

export const TOOL_STATUSES = ['active', 'draft'] as const
export type ToolStatus = (typeof TOOL_STATUSES)[number]

/** Only this status is ever recommended or listed by default. */
export const DEFAULT_STATUS: ToolStatus = 'active'

/* ─── Catalogue kind ───────────────────────────────────────────────────────── */

/**
 * Which directory a request is browsing: the workflow catalogue (Home) or the
 * MCP server directory (/mcp-servers). There is no 'all' value — an absent
 * kind means no filter, so every existing caller keeps its behaviour.
 */
export const CATALOGUE_KINDS = ['workflow', 'mcp'] as const
export type CatalogueKind = (typeof CATALOGUE_KINDS)[number]

/* ─── Roles ────────────────────────────────────────────────────────────────── */

/**
 * Seeded verbatim from the design's SETUP_ROLES so the role picker needs no
 * translation layer when Phase G wires it to GET /api/taxonomy.
 */
export const ROLES = [
  'Developer',
  'UI/UX Designer',
  'Graphic Designer',
  'Video Editor',
  'Content Creator',
  'Marketer',
  'Writer',
  'Researcher',
  'Student',
  'Entrepreneur',
  'Product Manager',
  'Data Analyst',
] as const

export type RoleName = (typeof ROLES)[number]

/** Free-text ways a user names their own role in a chat message. */
export const ROLE_KEYWORDS: Record<RoleName, readonly string[]> = {
  Developer: ['developer', 'engineer', 'programmer', 'coder', 'swe', 'dev'],
  'UI/UX Designer': ['ui designer', 'ux designer', 'ui/ux', 'product designer', 'interface designer'],
  'Graphic Designer': ['graphic designer', 'visual designer', 'illustrator', 'brand designer'],
  'Video Editor': ['video editor', 'editor', 'videographer', 'filmmaker', 'youtuber'],
  'Content Creator': ['content creator', 'creator', 'influencer', 'streamer', 'podcaster'],
  Marketer: ['marketer', 'marketing', 'growth', 'seo specialist', 'demand gen'],
  Writer: ['writer', 'author', 'copywriter', 'journalist', 'blogger', 'novelist'],
  Researcher: ['researcher', 'academic', 'scientist', 'phd', 'analyst of literature'],
  Student: ['student', 'undergrad', 'studying', 'coursework', 'exam'],
  Entrepreneur: ['entrepreneur', 'founder', 'startup', 'solopreneur', 'indie hacker'],
  'Product Manager': ['product manager', 'pm', 'product owner'],
  'Data Analyst': ['data analyst', 'analyst', 'data scientist', 'bi analyst'],
}

/* ─── Goals / use cases ────────────────────────────────────────────────────── */

/**
 * The design's SETUP_GOALS, per role, verbatim.
 *
 * Two goals appear under two roles ("Create shorts", "Research competitors");
 * USE_CASES below is the deduplicated flat vocabulary a tool record draws from.
 */
export const GOALS_BY_ROLE: Record<RoleName, readonly string[]> = {
  Developer: [
    'Write code faster',
    'Debug an issue',
    'Build a web app',
    'Build APIs',
    'Research documentation',
    'Generate tests',
    'Automate dev chores',
  ],
  'UI/UX Designer': [
    'Generate UI concepts',
    'Build wireframes',
    'Research competitors',
    'Create user flows',
    'Generate prototypes',
    'Improve UX copy',
  ],
  'Graphic Designer': [
    'Generate images',
    'Create branding concepts',
    'Design social assets',
    'Create illustrations',
    'Edit backgrounds',
    'Generate variations',
  ],
  'Video Editor': [
    'Generate clips',
    'Edit long videos',
    'Create shorts',
    'Add captions',
    'Generate B-roll',
    'Improve audio',
  ],
  'Content Creator': [
    'Plan content',
    'Script a video',
    'Create shorts',
    'Repurpose posts',
    'Generate thumbnails',
  ],
  Marketer: [
    'Create campaign ideas',
    'Generate ad copy',
    'Research competitors',
    'Create social content',
    'Analyze audience',
    'Build email campaigns',
    'Follow up with clients',
  ],
  Writer: [
    'Research a topic',
    'Draft an article',
    'Rewrite content',
    'Improve tone',
    'Summarize research',
    'Generate ideas',
  ],
  Researcher: [
    'Review literature',
    'Summarize papers',
    'Analyze data',
    'Structure findings',
    'Draft a report',
  ],
  Student: [
    'Study a topic',
    'Summarize notes',
    'Practice problems',
    'Write an essay',
    'Build a project',
  ],
  Entrepreneur: [
    'Validate an idea',
    'Research the market',
    'Build an MVP',
    'Write launch copy',
    'Find early users',
  ],
  'Product Manager': [
    'Write a spec',
    'Research users',
    'Analyze feedback',
    'Plan a roadmap',
    'Prototype a flow',
  ],
  'Data Analyst': [
    'Query in plain English',
    'Clean a dataset',
    'Build a dashboard',
    'Explain a trend',
    'Automate reports',
  ],
}

/** Flat, deduplicated goal vocabulary. A tool's `useCases` must be a subset. */
export const USE_CASES: readonly string[] = [
  ...new Set(Object.values(GOALS_BY_ROLE).flat()),
]

/* ─── Workflow stages ──────────────────────────────────────────────────────── */

/**
 * The closed V1 stage vocabulary.
 *
 * Ten stages, each with a plain-language label the assistant can render as a
 * workflow step. `keywords` drive stage inference in retrieval/normalize.ts.
 *
 * Chosen against two constraints, both verified by tests/catalogue.test.ts:
 *   1. every stage has at least two active tools (§9 — without two options the
 *      model cannot make a real choice, and a model that cannot find a tool for
 *      a stage it believes is necessary will invent one);
 *   2. every stage in every REC_PRESET workflow from the design maps onto one of
 *      these, so no real plan the design already shows becomes unexpressible.
 */
export const WORKFLOW_STAGES = [
  'research',
  'ideate',
  'draft',
  'design',
  'build',
  'edit',
  'analyse',
  'automate',
  'publish',
  'collaborate',
] as const

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]

/**
 * The order a plan's steps are shown in, once they have been chosen.
 *
 * Deliberately a SEPARATE list from `WORKFLOW_STAGES`, and not a re-sort of
 * it: that array is the taxonomy's own declaration order (grouping research
 * near ideation, editorial work near design), which is not the order a
 * reader wants to see a plan unfold in. This one reads as a narrative —
 * work out what to do, make it, ship it, then keep it running and in sync —
 * so "publish" comes before "automate", not after "analyse" as it does
 * above. A permutation of the same ten values, verified by
 * tests/catalogue.test.ts.
 */
export const PLAN_STEP_STAGE_ORDER: readonly WorkflowStage[] = [
  'research',
  'ideate',
  'draft',
  'design',
  'build',
  'edit',
  'publish',
  'automate',
  'analyse',
  'collaborate',
]

export interface StageDefinition {
  readonly id: WorkflowStage
  readonly label: string
  readonly description: string
  readonly keywords: readonly string[]
}

export const STAGE_DEFINITIONS: readonly StageDefinition[] = [
  {
    id: 'research',
    label: 'Research',
    description: 'Gather sources, scan competitors, read up before committing.',
    keywords: [
      'research', 'find', 'discover', 'explore', 'investigate', 'compare',
      'competitor', 'market', 'literature', 'paper', 'source', 'cite',
      'citation', 'learn', 'study', 'understand', 'read', 'search', 'validate',
      'benchmark', 'evidence',
    ],
  },
  {
    id: 'ideate',
    label: 'Ideate',
    description: 'Turn a vague intent into concepts, outlines and angles.',
    keywords: [
      'idea', 'ideate', 'brainstorm', 'concept', 'plan', 'planning', 'outline',
      'storyboard', 'script', 'spec', 'roadmap', 'strategy', 'angle', 'name',
      'naming', 'variation',
    ],
  },
  {
    id: 'draft',
    label: 'Draft',
    description: 'Produce the first version of the words.',
    keywords: [
      'write', 'writing', 'draft', 'copy', 'copywriting', 'compose', 'rewrite',
      'paraphrase', 'summarize', 'summarise', 'article', 'blog', 'essay',
      'newsletter', 'post', 'script', 'proposal', 'report',
    ],
  },
  {
    id: 'design',
    label: 'Design',
    description: 'Make the visual artefact — screens, assets, decks, images.',
    keywords: [
      'design', 'mockup', 'wireframe', 'prototype', 'layout', 'brand',
      'branding', 'logo', 'ui', 'ux', 'illustration', 'image', 'visual',
      'presentation', 'slide', 'deck', 'thumbnail', 'poster', 'banner',
      'graphic', 'asset', 'avatar',
    ],
  },
  {
    id: 'build',
    label: 'Build',
    description: 'Write and ship the working thing.',
    keywords: [
      'build', 'code', 'develop', 'development', 'implement', 'program', 'api',
      'app', 'debug', 'fix', 'refactor', 'test', 'mvp', 'website', 'site',
      'component', 'integrate', 'scaffold', 'bug',
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    description: 'Cut, clean and refine what already exists.',
    keywords: [
      'edit', 'editing', 'revise', 'revision', 'cut', 'trim', 'crop', 'retouch',
      'remove', 'clean', 'cleanup', 'polish', 'enhance', 'improve', 'proofread',
      'caption', 'subtitle', 'dub', 'master', 'shorten', 'tighten', 'grammar',
      'tone', 'upscale',
    ],
  },
  {
    id: 'analyse',
    label: 'Analyse',
    description: 'Interrogate data and turn it into an answer.',
    keywords: [
      'analyse', 'analyze', 'analysis', 'insight', 'metric', 'dashboard',
      'chart', 'measure', 'track', 'trend', 'forecast', 'data', 'dataset',
      'query', 'sql', 'spreadsheet', 'evaluate', 'feedback', 'statistics',
      'segment',
    ],
  },
  {
    id: 'automate',
    label: 'Automate',
    description: 'Take the repetitive part off a human.',
    keywords: [
      'automate', 'automation', 'automatic', 'workflow', 'integrate',
      'integration', 'trigger', 'agent', 'pipeline', 'repetitive', 'batch',
      'schedule', 'sync', 'zap', 'chore', 'routine', 'bulk',
    ],
  },
  {
    id: 'publish',
    label: 'Publish',
    description: 'Get it in front of people.',
    keywords: [
      'publish', 'post', 'posting', 'share', 'distribute', 'launch', 'ship',
      'deploy', 'upload', 'social', 'seo', 'promote', 'campaign', 'schedule',
      'audience', 'reach',
    ],
  },
  {
    id: 'collaborate',
    label: 'Collaborate',
    description: 'Keep the team, the meetings and the knowledge in sync.',
    keywords: [
      'collaborate', 'team', 'meeting', 'notes', 'knowledge', 'document',
      'wiki', 'handoff', 'onboarding', 'standup', 'minutes', 'recap',
      'workspace', 'handover',
    ],
  },
]

export const STAGE_BY_ID: Record<WorkflowStage, StageDefinition> = Object.fromEntries(
  STAGE_DEFINITIONS.map((stage) => [stage.id, stage]),
) as Record<WorkflowStage, StageDefinition>

/**
 * The plain-language phrase a non-technical reader sees instead of the stage id.
 *
 * "research", "automate" and the rest are the closed vocabulary retrieval and
 * scoring reason over — they stay exactly as they are everywhere else in this
 * file. This map is the ONE place a stage becomes a sentence a reader outside
 * the industry would say out loud, so the assistant's plan can show "Come up
 * with ideas" instead of "ideate" without a second stage vocabulary appearing
 * anywhere.
 */
export const STAGE_ACTIONS: Record<WorkflowStage, string> = {
  research: 'Look into your options',
  ideate: 'Come up with ideas',
  draft: 'Write the first version',
  design: 'Make it look good',
  build: 'Build it',
  edit: 'Polish it',
  analyse: 'See how it is doing',
  automate: 'Make it run on its own',
  publish: 'Share it',
  collaborate: 'Work on it with your team',
}

/* ─── Sorting ──────────────────────────────────────────────────────────────── */

/**
 * Machine sort keys. The design's chips ("Most popular", "Highest rated"…) are
 * display labels, so the mapping is published through GET /api/taxonomy rather
 * than hardcoded a second time in React.
 */
export const SORT_OPTIONS = [
  'relevance',
  'popular',
  'rating',
  'reviews',
  'name',
  'newest',
] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Best match',
  popular: 'Most popular',
  rating: 'Highest rated',
  reviews: 'Most reviewed',
  name: 'A–Z',
  /*
   * `newest` orders by `addedAt` — when the KART listed the tool, not when the
   * tool launched — so the label says "added" rather than "newest tools", which
   * would be a claim about the products themselves.
   *
   * It is one sort like any other: Browse offers it in its dropdown
   * (/browse?sort=newest) and the homepage's "Recently Added Tools" rail is the
   * same ordering, read from the shared catalogue rather than re-queried.
   */
  newest: 'Recently added',
}

/* ─── Editorial conventions for the display fields ─────────────────────────── */

/**
 * `pop` bands.
 *
 * `pop` is an EDITORIAL PROMINENCE SCORE — how widely known and adopted a tool
 * is, as judged by whoever curates the catalogue. It is deliberately banded
 * rather than continuous so nobody reads it as a measured statistic: a seed
 * record may not invent precision it does not have (§4 of the Phase C brief).
 */
export const PROMINENCE = {
  household: 95,
  major: 85,
  established: 70,
  growing: 55,
  niche: 40,
} as const

/**
 * The sentinel for a display field the seed catalogue has no reliable value for.
 *
 * `api`, `ctx`, `team`, `trial` and `integr` are free-text display strings on the
 * frontend card ("Yes", "200k tokens", "14 days", "31 apps"). Every one of those
 * is a factual claim about a third-party product that changes without notice, so
 * the editorial seed records it as "not recorded" rather than fabricating it.
 * Phase G renders the sentinel as an empty state.
 */
export const NOT_RECORDED = '—'

/**
 * How the seed catalogue's `addedAt` dates were produced.
 *
 * The catalogue held no intake metadata before this, and none could be
 * recovered: the 66 records were authored in one pass, grouped by category, so
 * the file's own order is a table of contents and not a timeline. Reading
 * recency out of it would have said "every Agents tool is newer than every
 * Writing tool", which is not true of anything.
 *
 * So V1 DECLARES an intake sequence rather than inferring one, and generates the
 * dates from it: `date(rank) = ANCHOR - rank * STEP_DAYS`, one record per step,
 * newest first. That keeps the ordering total (no ties), reproducible, and
 * trivial to throw away — when tools are added through a real admin path,
 * `addedAt` becomes a row's insert timestamp and every consumer stays as it is.
 *
 * The sequence itself is EDITORIAL, and honestly so: its head is the eight tools
 * the final design's "Recently Added Tools" rail names, and its tail follows the
 * file's authoring order, most recently authored first. These are not
 * observations about when anything really happened. What matters is that the
 * claim lives HERE, in the catalogue, where a query can sort on it and a future
 * import can overwrite it — and not in a React component deciding which cards
 * look new.
 */
export const INTAKE = {
  /** The most recently added record's date. */
  anchor: '2026-09-06',
  /** Days between consecutive records in the seeded sequence. */
  stepDays: 3,
} as const

/* ─── The published taxonomy ───────────────────────────────────────────────── */

/** Everything GET /api/taxonomy exposes. Shaped for the design's setup builder. */
export interface Taxonomy {
  categories: readonly ToolCategoryName[]
  categoryGroups: typeof SETUP_CATEGORY_GROUPS
  pricingTiers: readonly PricingTier[]
  pricingModels: readonly PricingModel[]
  roles: readonly RoleName[]
  goalsByRole: Record<RoleName, readonly string[]>
  useCases: readonly string[]
  stages: readonly StageDefinition[]
  sorts: ReadonlyArray<{ value: SortOption; label: string }>
}

export function buildTaxonomy(): Taxonomy {
  return {
    categories: TOOL_CATEGORIES,
    categoryGroups: SETUP_CATEGORY_GROUPS,
    pricingTiers: PRICING_TIERS,
    pricingModels: PRICING_MODELS,
    roles: ROLES,
    goalsByRole: GOALS_BY_ROLE,
    useCases: USE_CASES,
    stages: STAGE_DEFINITIONS,
    sorts: SORT_OPTIONS.map((value) => ({ value, label: SORT_LABELS[value] })),
  }
}

/* ─── Membership helpers ───────────────────────────────────────────────────── */

const CATEGORY_SET: ReadonlySet<string> = new Set(TOOL_CATEGORIES)
const ROLE_SET: ReadonlySet<string> = new Set(ROLES)
const USE_CASE_SET: ReadonlySet<string> = new Set(USE_CASES)
const STAGE_SET: ReadonlySet<string> = new Set(WORKFLOW_STAGES)

export function isToolCategory(value: string): value is ToolCategoryName {
  return CATEGORY_SET.has(value)
}
export function isRole(value: string): value is RoleName {
  return ROLE_SET.has(value)
}
export function isUseCase(value: string): boolean {
  return USE_CASE_SET.has(value)
}
export function isWorkflowStage(value: string): value is WorkflowStage {
  return STAGE_SET.has(value)
}

/* ─── Niches (automations, SPEC-automations.md §4) ────────────────────────────
 *
 * Not a Tool vocabulary — nothing above this line reads it, and no Tool field
 * is validated against it. It exists here anyway because taxonomy.ts is the
 * single source for every closed list in the server (§5.3), and an automation
 * is close enough in kind (a curated, editorial record) that a second such
 * list belongs beside this one rather than starting a new file for one array.
 * It is deliberately NOT part of `Taxonomy`/`buildTaxonomy()` above: that
 * shape backs the catalogue's public GET /api/taxonomy, and automations have
 * no route yet to serve it through.
 */
export const NICHES = ['Students', 'Customer Support Teams'] as const
export type NicheName = (typeof NICHES)[number]
