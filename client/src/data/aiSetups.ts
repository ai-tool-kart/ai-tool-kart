import type { AiSetup } from '@/types/aiSetup'

/*
 * The setup library — 19 setups, ported from the final design handoff's
 * `AI_SETUPS` array (ai-tool-kart-pre-final-design).
 *
 * Titles, descriptions, categories, stage sequences, badges, prompt/workflow/
 * agent counts and the tone rotation are the handoff's, unchanged. Two things
 * are not:
 *
 *  - the prototype stored each tool as a `["Claude", "Cl"]` pair — a name and a
 *    monogram frozen into the homepage. Those are catalogue facts, so they are
 *    replaced by `toolSlugs`, and the name and monogram on every card are read
 *    from the live record. Nothing about a tool is stated in this file;
 *  - the prototype's `meta` was a pre-written string ("3 tools · 1 workflow ·
 *    4 prompts"). The tool count is now counted from what actually resolves, so
 *    only the editorial halves survive as `workflowCount` / `agentCount` /
 *    `promptCount`.
 *
 * ── Prototype tool references, checked against all 66 catalogue records ──────
 *
 * Every reference resolves except one. Where the prototype's label and the
 * catalogue's record name differ, they are the same product under its current
 * name and the slug is exact:
 *
 *   Canva AI → canva            Copilot → github-copilot
 *   Figma AI → figma            CapCut AI → capcut
 *   Zapier AI → zapier          Relay Agents → relay (Relay.app)
 *
 * The exception is GALILEO, in "Build a SaaS Landing Page". Galileo AI is a
 * text-to-UI design tool and the catalogue has no record of it. Its slot in the
 * setup is the UI step between the copy (Claude) and the build (Cursor), and the
 * catalogue's closest real equivalent for that step is Uizard — text-to-UI, same
 * place in the same flow. The reference is therefore RETARGETED to `uizard`
 * rather than dropped, and stated here so the substitution is visible rather
 * than discovered later. Nothing was invented to make the design work: had there
 * been no equivalent, the slug would simply be absent and the card would render
 * with two tools and say "2 tools".
 *
 * Also worth noting: the prototype drew Gamma with the monogram "Gm" and Gemini
 * with "Gm" too. The catalogue is unambiguous (Gamma is "Ga", Gemini is "Gm")
 * and the cards now show the catalogue's, so that collision is gone.
 */

export const AI_SETUPS: AiSetup[] = [
  /* ── Writing & Content ───────────────────────────────────────────────────── */
  {
    id: 'research-draft-polish',
    title: 'Research → Draft → Polish',
    category: 'Writing & Content',
    featured: true,
    badge: 'Most used',
    description: 'Cited research into a finished long-form piece that still sounds like you.',
    toolSlugs: ['perplexity', 'claude', 'grammarly'],
    stages: ['Research', 'Outline', 'Draft', 'Edit'],
    workflowCount: 1,
    promptCount: 4,
    tone: 'violet',
  },
  {
    id: 'seo-blog-production',
    title: 'SEO Blog Production',
    category: 'Writing & Content',
    description: 'Keyword set to published post, scored against the pages already ranking.',
    toolSlugs: ['perplexity', 'writesonic', 'surfer-seo'],
    stages: ['Keywords', 'Draft', 'Optimise', 'Publish'],
    promptCount: 5,
    tone: 'sky',
  },
  {
    id: 'social-content-pipeline',
    title: 'Social Content Pipeline',
    category: 'Writing & Content',
    description: 'One idea becomes a week of captions, visuals and scheduled posts.',
    toolSlugs: ['claude', 'canva', 'buffer'],
    stages: ['Idea', 'Copy', 'Visual', 'Schedule'],
    promptCount: 6,
    tone: 'pink',
  },

  /* ── Coding & Dev ────────────────────────────────────────────────────────── */
  {
    id: 'saas-landing-page',
    title: 'Build a SaaS Landing Page',
    category: 'Coding & Dev',
    featured: true,
    badge: 'Recommended',
    description:
      'Competitor research through to a deployed page, handed off cleanly at each step.',
    // `uizard` stands in for the prototype's Galileo. See the header note.
    toolSlugs: ['perplexity', 'claude', 'uizard', 'cursor'],
    stages: ['Research', 'Copy', 'UI', 'Build'],
    workflowCount: 1,
    promptCount: 3,
    tone: 'blue',
  },
  {
    id: 'debug-and-refactor',
    title: 'Debug & Refactor',
    category: 'Coding & Dev',
    description: 'Read the repo, find the real cause, refactor with tests around it.',
    toolSlugs: ['claude', 'cursor', 'github-copilot'],
    stages: ['Inspect', 'Diagnose', 'Refactor', 'Test'],
    promptCount: 4,
    tone: 'sky',
  },
  {
    id: 'ship-an-api',
    title: 'Ship an API',
    category: 'Coding & Dev',
    description: 'Spec, endpoints, tests and readable docs from one plain-language brief.',
    toolSlugs: ['claude', 'cursor', 'postman'],
    stages: ['Plan', 'Build', 'Test', 'Document'],
    promptCount: 5,
    tone: 'violet',
  },

  /* ── Image Generation ────────────────────────────────────────────────────── */
  {
    id: 'product-image-workflow',
    title: 'Product Image Workflow',
    category: 'Image Generation',
    featured: true,
    description: 'Phone photos to clean catalogue shots, batched and on-brand.',
    toolSlugs: ['photoroom', 'midjourney', 'ideogram'],
    stages: ['Shoot', 'Clean', 'Generate', 'Retouch'],
    promptCount: 4,
    tone: 'sand',
  },
  {
    id: 'brand-concept-exploration',
    title: 'Brand Concept Exploration',
    category: 'Image Generation',
    description: 'Wide visual exploration, narrowed to three directions worth presenting.',
    toolSlugs: ['midjourney', 'ideogram', 'figma'],
    stages: ['Brief', 'Explore', 'Refine', 'Present'],
    promptCount: 6,
    tone: 'pink',
  },

  /* ── Video ───────────────────────────────────────────────────────────────── */
  {
    id: 'long-video-to-shorts',
    title: 'Long Video → Shorts',
    category: 'Video',
    featured: true,
    description:
      'One recording becomes ranked short cuts with captions, in about 25 minutes.',
    toolSlugs: ['descript', 'opus-clip', 'capcut'],
    stages: ['Transcript', 'Cut', 'Clip', 'Caption'],
    workflowCount: 1,
    promptCount: 4,
    tone: 'blue',
  },
  {
    id: 'ai-ad-creation',
    title: 'AI Ad Creation',
    category: 'Video',
    description: 'Script, generated footage and voiceover assembled into a testable ad.',
    toolSlugs: ['runway', 'elevenlabs', 'kling'],
    stages: ['Script', 'Generate', 'Voice', 'Assemble'],
    promptCount: 5,
    tone: 'violet',
  },

  /* ── SEO & Marketing ─────────────────────────────────────────────────────── */
  {
    id: 'lead-generation-stack',
    title: 'Lead Generation Stack',
    category: 'SEO & Marketing',
    featured: true,
    badge: 'Best for teams',
    description:
      'Enriched lists, a first touch worth reading, and follow-ups that fire themselves.',
    toolSlugs: ['clay', 'claude', 'zapier'],
    stages: ['Enrich', 'Draft', 'Send', 'Track'],
    workflowCount: 1,
    promptCount: 5,
    tone: 'sky',
  },
  {
    id: 'campaign-research-copy',
    title: 'Campaign Research + Copy',
    category: 'SEO & Marketing',
    description: 'Market read to angles to ad copy, with variants ready to test.',
    toolSlugs: ['perplexity', 'copy-ai', 'surfer-seo'],
    stages: ['Research', 'Angle', 'Copy', 'Test'],
    promptCount: 4,
    tone: 'pink',
  },

  /* ── Business ────────────────────────────────────────────────────────────── */
  {
    id: 'automate-client-follow-ups',
    title: 'Automate Client Follow-ups',
    category: 'Business',
    featured: true,
    description: 'Drafted, approved and sent without you touching the thread twice.',
    toolSlugs: ['claude', 'zapier', 'relay'],
    stages: ['Trigger', 'Draft', 'Approve', 'Send'],
    agentCount: 2,
    promptCount: 5,
    tone: 'violet',
  },
  {
    id: 'meeting-to-action-items',
    title: 'Meeting → Action Items',
    category: 'Business',
    description: 'Every call ends as owned tasks in the tool your team already uses.',
    toolSlugs: ['fathom', 'claude', 'notion-ai'],
    stages: ['Record', 'Summarise', 'Assign', 'Track'],
    promptCount: 3,
    tone: 'sand',
  },

  /* ── Research ────────────────────────────────────────────────────────────── */
  {
    id: 'literature-review',
    title: 'Literature Review',
    category: 'Research',
    badge: 'Recommended',
    description: 'Screen the field, extract findings into a table, keep every citation.',
    toolSlugs: ['elicit', 'notebooklm', 'claude'],
    stages: ['Screen', 'Extract', 'Synthesise', 'Cite'],
    promptCount: 5,
    tone: 'sky',
  },
  {
    id: 'competitor-analysis',
    title: 'Competitor Analysis',
    category: 'Research',
    description: 'Six competitors compared on the axes that decide your positioning.',
    toolSlugs: ['perplexity', 'claude', 'gamma'],
    stages: ['Gather', 'Compare', 'Position', 'Present'],
    promptCount: 4,
    tone: 'violet',
  },

  /* ── Audio & Voice ───────────────────────────────────────────────────────── */
  {
    id: 'narration-and-dubbing',
    title: 'Narration & Dubbing',
    category: 'Audio & Voice',
    description: 'Script to mastered voiceover, consistent across a whole series.',
    toolSlugs: ['elevenlabs', 'descript', 'suno'],
    stages: ['Script', 'Voice', 'Clean', 'Master'],
    promptCount: 3,
    tone: 'pink',
  },

  /* ── Assistants ──────────────────────────────────────────────────────────── */
  {
    id: 'team-knowledge-assistant',
    title: 'Team Knowledge Assistant',
    category: 'Assistants',
    description: 'An assistant that answers from your own docs instead of the open web.',
    toolSlugs: ['glean', 'claude', 'notion-ai'],
    stages: ['Connect', 'Index', 'Ask', 'Refine'],
    agentCount: 1,
    promptCount: 4,
    tone: 'blue',
  },

  /* ── Productivity ────────────────────────────────────────────────────────── */
  {
    id: 'inbox-and-task-triage',
    title: 'Inbox & Task Triage',
    category: 'Productivity',
    description: 'Mail, notes and requests sorted into a day you can actually work.',
    toolSlugs: ['gemini', 'zapier', 'notion-ai'],
    stages: ['Capture', 'Triage', 'Draft', 'Schedule'],
    agentCount: 2,
    promptCount: 3,
    tone: 'violet',
  },
]
