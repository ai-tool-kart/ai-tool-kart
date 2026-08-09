import type { Faq } from '@/types/content'

/* TEMPORARY mock data — ported from `faqs` in the handoff. */

export const FAQS: Faq[] = [
  {
    q: 'How do tools get ranked?',
    a: 'By our own test runs plus verified user reviews. Nobody can pay for position, and every listing shows the date it was last re-tested.',
  },
  {
    q: 'What counts as a test run?',
    a: 'Each category has a fixed task set — the same prompts, files and edge cases for every tool in it. We publish the raw outputs alongside the score.',
  },
  {
    q: 'Do you take affiliate revenue?',
    a: 'No. Revenue is Pro and Team subscriptions only, which is the whole reason the rankings can stay boring and honest.',
  },
  {
    q: 'What are stack-aware recommendations?',
    a: "You tell us the tools you already pay for. We only suggest things that fit that stack, and we flag overlap you're already paying twice for.",
  },
  {
    q: 'How fast do new tools get listed?',
    a: 'Submissions are reviewed within 48 hours. Anything that clears the test set goes live the same week.',
  },
]
