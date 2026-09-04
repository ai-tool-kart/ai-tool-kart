/*
 * Verifier prompt (NEWS_AGENT.md §13, §14).
 *
 * Decides, per claim, whether the assembled evidence actually supports it. This
 * is the gate that keeps unsupported statements out of an article, so it is
 * biased toward scepticism: when in doubt, a claim is downgraded, not upgraded.
 */

import { HOUSE_RULES, UNTRUSTED_CONTENT_RULES, wrapUntrusted } from './shared.ts'

export const VERIFIER_SYSTEM = `
${HOUSE_RULES}

TASK: CLAIM VERIFICATION

You are given a set of extracted claims and the evidence they came from. For
each claim, decide how well the evidence supports it.

SUPPORT LEVELS

verified      — Two or more INDEPENDENT sources support the claim, or a single
                Tier 1 (official/primary) source states it directly. Tier 1 is
                authoritative for facts about its own product.

single-source — Exactly one non-Tier-1 source supports it, with no corroboration.
                The claim may be true, but it is not established.

unsupported   — No supplied evidence states this. Includes claims that are a
                reasonable inference but that no source actually makes.

conflicting   — Two or more sources make incompatible statements. Set
                conflictNote describing exactly what disagrees, naming both
                values and both publishers.

RULES
  - Judge ONLY against the evidence supplied. Your background knowledge is not
    evidence, even if you are confident.
  - Do not upgrade a claim because it sounds plausible or matches what you would
    expect. Plausibility is not support.
  - A vendor's own blog IS authoritative for its own pricing, capabilities and
    release dates. It is NOT authoritative for competitors or market claims.
  - Two outlets both citing the same press release are ONE source, not two.
    Independence means independent reporting.
  - supportingUrls must contain only URLs present in the supplied evidence.
  - Identify coreClaimId: the single claim the story fundamentally rests on. If
    that claim is not at least verified or single-source, the story cannot run.

${UNTRUSTED_CONTENT_RULES}
`.trim()

export interface VerifierEvidenceInput {
  url: string
  publisher: string
  title: string
  trustTier: number
  publishedAt?: string
  excerpt: string
}

export interface VerifierInput {
  storyTitle: string
  claims: Array<{ id: string; text: string; claimType: string; sourceUrl: string }>
  evidence: VerifierEvidenceInput[]
}

export function verifierUserPrompt(input: VerifierInput): string {
  const evidenceBlocks = input.evidence
    .map(
      (item) =>
        `EVIDENCE (trusted metadata)\n  url: ${item.url}\n  publisher: ${item.publisher}\n  tier: ${item.trustTier}\n  published: ${item.publishedAt ?? 'unknown'}\n\n${wrapUntrusted(item.publisher, item.excerpt)}`,
    )
    .join('\n\n')

  // Claim text originated in source documents, so it stays inside the untrusted
  // wrapper even though our own pipeline assigned the ids.
  const claimBlocks = input.claims
    .map((claim) => `  ${claim.id} [${claim.claimType}] (from ${claim.sourceUrl})`)
    .join('\n')

  const claimTexts = input.claims
    .map((claim) => wrapUntrusted(`claim ${claim.id}`, claim.text))
    .join('\n\n')

  return `
Story: ${input.storyTitle}

CLAIMS TO VERIFY (ids and types are ours; the statements are source-derived)
${claimBlocks}

Claim statements:

${claimTexts}

AVAILABLE EVIDENCE

${evidenceBlocks}

Assess each claim by id. Return one entry per claim id listed above.
`.trim()
}
