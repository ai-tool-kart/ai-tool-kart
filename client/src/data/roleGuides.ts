import type { AutomationRef } from '@/types/automation'

/*
 * "Build Your AI Setup" roles that open a guide instead of asking the assistant.
 *
 * Keyed by the role exactly as GET /api/taxonomy lists it (the server's ROLES),
 * which is also exactly what the role picker hands back. A role typed through
 * "Other / type manually…" never matches a key, so it keeps the assistant
 * behaviour — as does every role not listed here.
 *
 * Six of the twelve roles, each the "good fit" pick in docs/LINK-CANDIDATES.md.
 * The other six are pending a client decision. Every pair is checked against
 * the imported automations, and every key against ROLES, by
 * server/tests/guideLinks.test.ts.
 *
 * ROLE-LEVEL ON PURPOSE, and coarse because of it: "Let's Build" sends a role
 * AND a goal, but a linked role opens the same guide whichever goal was picked.
 * If per-goal precision is asked for later, the finer-grained option is a
 * (role, goal) → guide map over the 68 goals in GOALS_BY_ROLE, falling back to
 * this role-level entry.
 */
export const ROLE_GUIDES: Readonly<Record<string, AutomationRef>> = {
  'Graphic Designer': {
    niche: 'Marketing Agencies',
    slug: 'generate-a-full-set-of-visually-consistent-campaign-images-from',
  },
  'Video Editor': {
    niche: 'Photographers & Videographers',
    slug: 'generate-custom-b-roll-clips-instead-of-searching-stock-footage',
  },
  'Content Creator': {
    niche: 'Content Creators-Writers',
    slug: 'i-want-to-write-a-youtube-video-script-from-a-topic',
  },
  Writer: {
    niche: 'Virtual Assistants',
    slug: 'research-a-competitor-or-topic-quickly-with-real-citable-sources',
  },
  Student: {
    niche: 'Students',
    slug: 'practice-coding-interview-problems-before-a-tech-internship',
  },
  'Data Analyst': {
    niche: 'Marketing Agencies',
    slug: 'build-a-self-serve-dashboard-clients-can-query-in-plain-english',
  },
}
