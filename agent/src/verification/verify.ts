/*
 * Claim verification (NEWS_AGENT.md §5, §14).
 *
 * Two layers, and the deterministic one has the final say:
 *
 *   1. The Verifier LLM judges support against the supplied evidence.
 *   2. Tier rules from config/limits.ts are then applied on top. A claim the
 *      model called "verified" is downgraded if the evidence backing it does not
 *      meet the tier requirement for its claim type.
 *
 * That ordering matters. Pricing, capability, date and benchmark claims require
 * a Tier 1 source no matter how confident a model is about a TechCrunch article,
 * because the vendor is the only authority on its own product.
 */

import { CLAIM_RULES, DEFAULT_CLAIM_RULE, MIN_VERIFIED_CLAIMS } from '../config/limits.ts'
import type { Claim, SourceEvidence, SupportLevel, TrustTier } from '../domain/types.ts'
import type { LLMClient } from '../llm/client.ts'
import { VerificationSchema } from '../llm/schemas.ts'
import { VERIFIER_SYSTEM, verifierUserPrompt } from '../llm/prompts/index.ts'
import type { Logger } from '../utils/logger.ts'
import { truncateWords } from '../utils/text.ts'

export interface VerificationOutcome {
  claims: Claim[]
  /** Claims that survived at verified or single-source. */
  usableClaims: Claim[]
  coreClaimId?: string
  sufficient: boolean
  reason?: string
  conflicts: Claim[]
}

export interface VerifyDeps {
  llm: LLMClient
  logger: Logger
}

const MAX_CLAIMS_SENT = 25
const EVIDENCE_EXCERPT_CHARS = 6000

export async function verifyClaims(
  storyTitle: string,
  claims: Claim[],
  evidence: SourceEvidence[],
  deps: VerifyDeps,
): Promise<VerificationOutcome> {
  const { llm, logger } = deps
  const log = logger.child({ step: 'verify' })

  if (claims.length === 0) {
    return { claims: [], usableClaims: [], sufficient: false, reason: 'no-claims-extracted', conflicts: [] }
  }

  const tierByUrl = new Map(evidence.map((item) => [item.url, item.trustTier]))
  const publisherByUrl = new Map(evidence.map((item) => [item.url, item.publisher]))

  const sent = claims.slice(0, MAX_CLAIMS_SENT)

  const response = await llm.run({
    task: 'verify',
    system: VERIFIER_SYSTEM,
    user: verifierUserPrompt({
      storyTitle,
      claims: sent.map((claim) => ({
        id: claim.id,
        text: claim.text,
        claimType: claim.claimType,
        sourceUrl: claim.evidenceUrls[0] ?? 'unknown',
      })),
      evidence: evidence.map((item) => ({
        url: item.url,
        publisher: item.publisher,
        title: item.title,
        trustTier: item.trustTier,
        ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
        excerpt: truncateWords(item.cleanedText, EVIDENCE_EXCERPT_CHARS),
      })),
    }),
    schema: VerificationSchema,
    schemaName: 'Verification',
    temperature: 0,
  })

  const verdictById = new Map(response.data.claims.map((entry) => [entry.claimId, entry]))

  const verified: Claim[] = sent.map((claim) => {
    const verdict = verdictById.get(claim.id)
    if (!verdict) {
      // A claim the verifier ignored is not thereby supported.
      return { ...claim, supportLevel: 'unsupported' as SupportLevel }
    }

    /*
     * Only URLs that are actually part of this story's evidence count. A model
     * that echoes a URL from the claim text cannot manufacture support.
     */
    const supportingUrls = verdict.supportingUrls.filter((url) => tierByUrl.has(url))
    const tiers = supportingUrls
      .map((url) => tierByUrl.get(url))
      .filter((tier): tier is TrustTier => tier !== undefined)

    const adjusted = applyTierRules(claim.claimType, verdict.supportLevel, tiers, supportingUrls)

    return {
      ...claim,
      supportLevel: adjusted,
      evidenceUrls: supportingUrls.length > 0 ? supportingUrls : claim.evidenceUrls,
      ...(tiers.length > 0 ? { bestTier: Math.min(...tiers) as TrustTier } : {}),
      ...(verdict.conflictNote ? { conflictNote: verdict.conflictNote } : {}),
    }
  })

  const usableClaims = verified.filter(
    (claim) => claim.supportLevel === 'verified' || claim.supportLevel === 'single-source',
  )
  const conflicts = verified.filter((claim) => claim.supportLevel === 'conflicting')

  const outcome = assessSufficiency(verified, usableClaims, response.data.coreClaimId)

  log.info('Verification complete', {
    claims: verified.length,
    usable: usableClaims.length,
    conflicts: conflicts.length,
    sufficient: outcome.sufficient,
    reason: outcome.reason,
  })

  return {
    claims: verified,
    usableClaims,
    ...(response.data.coreClaimId ? { coreClaimId: response.data.coreClaimId } : {}),
    conflicts,
    ...outcome,
  }
}

/**
 * Downgrades a model verdict that the evidence tiers do not justify.
 *
 * Never upgrades. The deterministic rules exist to be stricter than the model,
 * not to rescue claims it doubted.
 */
export function applyTierRules(
  claimType: string,
  modelVerdict: SupportLevel,
  tiers: TrustTier[],
  supportingUrls: string[],
): SupportLevel {
  if (modelVerdict === 'unsupported' || modelVerdict === 'conflicting') return modelVerdict
  if (supportingUrls.length === 0) return 'unsupported'

  const rule = CLAIM_RULES[claimType] ?? DEFAULT_CLAIM_RULE
  const hasTier1 = tiers.includes(1)
  const independentTier2 = tiers.filter((tier) => tier === 2).length

  if (rule.requiresTier1 && !hasTier1) {
    /*
     * A specific figure sourced only to secondary coverage is reportable with
     * attribution, but it is not established fact. Downgrading rather than
     * discarding lets the writer say "according to X" instead of dropping the
     * story (§14).
     */
    return 'single-source'
  }

  if (hasTier1) return 'verified'
  if (independentTier2 >= rule.minIndependentTier2 && rule.minIndependentTier2 > 0) return 'verified'
  if (tiers.every((tier) => tier === 3)) return 'unsupported'

  return 'single-source'
}

function assessSufficiency(
  allClaims: Claim[],
  usableClaims: Claim[],
  coreClaimId?: string,
): { sufficient: boolean; reason?: string } {
  if (coreClaimId) {
    const core = allClaims.find((claim) => claim.id === coreClaimId)
    if (core && core.supportLevel === 'unsupported') {
      return { sufficient: false, reason: 'core-claim-unsupported' }
    }
    if (core && core.supportLevel === 'conflicting') {
      // §14: a conflict touching the core claim, with no authoritative
      // resolution, means the story does not run.
      const resolved = core.bestTier === 1
      if (!resolved) return { sufficient: false, reason: 'core-claim-conflicting' }
    }
  }

  if (usableClaims.length < MIN_VERIFIED_CLAIMS) {
    return {
      sufficient: false,
      reason: `too-few-verified-claims (${usableClaims.length} < ${MIN_VERIFIED_CLAIMS})`,
    }
  }

  const fullyVerified = usableClaims.filter((claim) => claim.supportLevel === 'verified').length
  if (fullyVerified === 0) {
    return { sufficient: false, reason: 'no-fully-verified-claims' }
  }

  return { sufficient: true }
}
