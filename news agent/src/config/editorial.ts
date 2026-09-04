/*
 * Editorial scope — configuration, not code (NEWS_AGENT.md §4).
 *
 * Every keyword list, category and hard-reject rule lives in this one module so
 * that tuning editorial judgment never means touching ingestion, ranking or
 * generation. Nothing elsewhere in the codebase may define a topic list.
 */

/** Internal category ids. Mapped to WordPress terms in wordpress/taxonomy.ts. */
export const EDITORIAL_CATEGORIES = [
  'ai-models',
  'ai-agents',
  'development',
  'design',
  'image-video',
  'productivity',
  'research',
  'mcp',
  'product-updates',
  'industry',
] as const

export type EditorialCategory = (typeof EDITORIAL_CATEGORIES)[number]

/** Display names, used for the WordPress term and for prompt context. */
export const CATEGORY_LABELS: Record<EditorialCategory, string> = {
  'ai-models': 'AI Models',
  'ai-agents': 'AI Agents',
  development: 'Development',
  design: 'Design',
  'image-video': 'Image & Video',
  productivity: 'Productivity',
  research: 'Research',
  mcp: 'MCP',
  'product-updates': 'Product Updates',
  industry: 'Industry',
}

export function isEditorialCategory(value: string): value is EditorialCategory {
  return (EDITORIAL_CATEGORIES as readonly string[]).includes(value)
}

export interface TopicRule {
  id: string
  /** Lowercase substrings matched against title + summary. */
  keywords: string[]
  /** Positive nudges the score up, negative down. Ignored for hard rejects. */
  weight: number
  /** Hard rejects skip the story before any LLM call is made. */
  hardReject?: boolean
}

/*
 * Topics worth covering. These raise a story's deterministic prior; they never
 * on their own qualify a story — the classifier and the score threshold still
 * apply.
 */
export const INCLUDED_TOPICS: TopicRule[] = [
  { id: 'model-launch', keywords: ['launch', 'introducing', 'announcing', 'released', 'now available', 'general availability', 'ga release'], weight: 2 },
  { id: 'model-update', keywords: ['context window', 'benchmark', 'model update', 'new model', 'upgraded', 'improved reasoning'], weight: 2 },
  { id: 'agents', keywords: ['agent', 'agentic', 'tool use', 'function calling', 'computer use'], weight: 2 },
  { id: 'coding-tools', keywords: ['coding agent', 'code completion', 'developer tool', 'ide', 'sdk', 'cli', 'api'], weight: 1.5 },
  { id: 'mcp', keywords: ['model context protocol', 'mcp server', 'mcp client', ' mcp '], weight: 2.5 },
  { id: 'design-tools', keywords: ['design tool', 'figma', 'canva', 'prototyping'], weight: 1.5 },
  { id: 'media-gen', keywords: ['image generation', 'video generation', 'text-to-image', 'text-to-video', 'diffusion'], weight: 1.5 },
  { id: 'pricing', keywords: ['pricing', 'price cut', 'per million tokens', 'free tier', 'subscription'], weight: 1.5 },
  { id: 'availability', keywords: ['open source', 'open weights', 'now in preview', 'public beta', 'waitlist'], weight: 1 },
  { id: 'integration', keywords: ['integration', 'now supports', 'partnership', 'available in'], weight: 1 },
]

/*
 * Noise. Negative-weight rules dampen the score; hardReject rules drop the story
 * before it can cost a classifier call (§27).
 */
export const EXCLUDED_TOPICS: TopicRule[] = [
  { id: 'rumor', keywords: ['rumor', 'rumour', 'reportedly', 'sources say', 'could launch', 'might launch', 'is said to', 'allegedly'], weight: -3 },
  { id: 'stock', keywords: ['stock price', 'shares rose', 'shares fell', 'market cap', 'nasdaq', 'ipo filing', 'q3 earnings', 'q4 earnings'], weight: -3, hardReject: true },
  { id: 'doom', keywords: ['will replace all', 'end of programmers', 'ai will destroy', 'is dead', 'nobody needs'], weight: -4, hardReject: true },
  { id: 'celebrity', keywords: ['musk says', 'says in interview', 'slams', 'fires back', 'clapped back', 'drama'], weight: -3 },
  { id: 'clickbait', keywords: ['you won\'t believe', 'this one trick', 'shocking', 'mind-blowing', 'insane', 'top 10 ', 'best 10 '], weight: -4, hardReject: true },
  { id: 'listicle', keywords: ['prompts you should', 'tools you need', 'ways to use', 'tips and tricks'], weight: -3, hardReject: true },
  { id: 'unrelated-funding', keywords: ['series a', 'series b', 'seed round', 'raises $'], weight: -1.5 },
  { id: 'horoscope-noise', keywords: ['crypto', 'nft', 'web3', 'metaverse'], weight: -3, hardReject: true },
]

/**
 * Domains never worth ingesting or citing: aggregators, content mills, and
 * anything that republishes other outlets' work without reporting.
 */
export const BANNED_DOMAINS: string[] = [
  'news.google.com',
  'flipboard.com',
  'medium.com',
  'msn.com',
  'yahoo.com',
  'benzinga.com',
  'investing.com',
  'analyticsinsight.net',
  'marktechpost.com',
]

/**
 * Entities eligible to become WordPress tags (§20). Tags are entity-based, never
 * thematic, so this list is deliberately a closed vocabulary: the model proposes
 * tags, and anything outside this map is dropped rather than created.
 *
 * The key is the normalized lookup form; the value is the canonical display tag.
 */
export const TAG_ENTITIES: Record<string, string> = {
  openai: 'OpenAI',
  'open ai': 'OpenAI',
  chatgpt: 'ChatGPT',
  gpt: 'GPT',
  anthropic: 'Anthropic',
  claude: 'Claude',
  google: 'Google',
  deepmind: 'DeepMind',
  'google deepmind': 'DeepMind',
  gemini: 'Gemini',
  microsoft: 'Microsoft',
  copilot: 'GitHub Copilot',
  'github copilot': 'GitHub Copilot',
  github: 'GitHub',
  meta: 'Meta',
  llama: 'Llama',
  mistral: 'Mistral',
  'hugging face': 'Hugging Face',
  huggingface: 'Hugging Face',
  nvidia: 'Nvidia',
  adobe: 'Adobe',
  figma: 'Figma',
  canva: 'Canva',
  runway: 'Runway',
  midjourney: 'Midjourney',
  'stable diffusion': 'Stable Diffusion',
  stability: 'Stability AI',
  cursor: 'Cursor',
  perplexity: 'Perplexity',
  notion: 'Notion',
  slack: 'Slack',
  aws: 'AWS',
  azure: 'Azure',
  mcp: 'MCP',
  'model context protocol': 'MCP',
  langchain: 'LangChain',
  ollama: 'Ollama',
  groq: 'Groq',
  'eleven labs': 'ElevenLabs',
  elevenlabs: 'ElevenLabs',
  suno: 'Suno',
  replit: 'Replit',
  vercel: 'Vercel',
  supabase: 'Supabase',
}

/**
 * Entity names that signal the story concerns a product our audience uses.
 * Used as a deterministic relevance signal before any LLM call (§11).
 */
export const AUDIENCE_ENTITIES: string[] = Object.keys(TAG_ENTITIES)

/**
 * Phrases the Editor pass flags as generic LLM prose (§15). Kept here so the
 * tone rules are configuration rather than being buried in a prompt string.
 */
export const BANNED_PHRASES: string[] = [
  'in the rapidly evolving landscape',
  'in the ever-evolving',
  "it's important to note that",
  'it is important to note that',
  'game-changing',
  'game changer',
  'revolutionary',
  'delve into',
  'unlock the power',
  'harness the power',
  'a testament to',
  'in conclusion',
  'the world of ai',
  'buckle up',
  'look no further',
]

export interface EditorialScope {
  includedTopics: TopicRule[]
  excludedTopics: TopicRule[]
  bannedDomains: string[]
  bannedPhrases: string[]
  tagEntities: Record<string, string>
  audienceEntities: string[]
  categories: readonly EditorialCategory[]
  /** Stories older than this are stale news, not news. */
  maxStoryAgeHours: number
  /** Title/summary shorter than this is a stub, not a story. */
  minTitleLength: number
}

export const EDITORIAL_SCOPE: EditorialScope = {
  includedTopics: INCLUDED_TOPICS,
  excludedTopics: EXCLUDED_TOPICS,
  bannedDomains: BANNED_DOMAINS,
  bannedPhrases: BANNED_PHRASES,
  tagEntities: TAG_ENTITIES,
  audienceEntities: AUDIENCE_ENTITIES,
  categories: EDITORIAL_CATEGORIES,
  maxStoryAgeHours: 96,
  minTitleLength: 12,
}
