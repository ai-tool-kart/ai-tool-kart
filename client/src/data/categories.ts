import type { Category } from '@/types/category'

/* TEMPORARY mock data — ported from CATEGORIES in the Claude Design handoff. */

export const CATEGORIES: Category[] = [
  { name: 'Writing', count: 284, note: 'Drafting, editing, rewriting and translation.' },
  { name: 'Image', count: 361, note: 'Generation, retouching, product shots, upscaling.' },
  { name: 'Code', count: 219, note: 'Review, refactors, test generation, agents in CI.' },
  { name: 'Video', count: 148, note: 'Editing, dubbing, shorts, avatars and captions.' },
  { name: 'Audio', count: 132, note: 'Transcription, voice, music, meeting notes.' },
  { name: 'Agents', count: 176, note: 'Multi-step automations that touch real systems.' },
  { name: 'Data', count: 203, note: 'Warehouse queries, cleanup, enrichment, charts.' },
  { name: 'Design', count: 167, note: 'Layout, tokens, handoff and asset generation.' },
]
