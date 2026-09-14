/*
 * Stage 3 — claim verification.
 *
 * The support vocabulary is the pipeline's own (domain/types.ts SupportLevel):
 * verified / single-source / unsupported / conflicting. It is NOT relabelled
 * into friendlier words here — the demo should teach the client the terms the
 * system actually uses, and the tier rules in verification/verify.ts are what
 * make "single-source" a distinct and meaningful outcome rather than a soft
 * "verified".
 */

import { Card, Empty, Pill, TierPill } from './primitives'
import type { DemoClaim, RunState, StoryState } from '@/types/newsAgentDemo'

const SUPPORT: Record<string, { tone: 'good' | 'warn' | 'bad' | 'neutral'; mark: string; note: string }> = {
  verified: { tone: 'good', mark: '✓', note: 'Corroborated to the tier its claim type requires' },
  'single-source': {
    tone: 'warn',
    mark: '~',
    note: 'Reportable with attribution, not established fact',
  },
  unsupported: { tone: 'bad', mark: '✕', note: 'Not traceable to this story’s evidence' },
  conflicting: { tone: 'bad', mark: '!', note: 'Sources disagree' },
}

function ClaimRow({ claim }: { claim: DemoClaim }) {
  const support = SUPPORT[claim.supportLevel] ?? {
    tone: 'neutral' as const,
    mark: '?',
    note: '',
  }

  return (
    <li className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 font-mono ${
            support.tone === 'good'
              ? 'text-emerald-400'
              : support.tone === 'warn'
                ? 'text-amber-400'
                : 'text-red-400'
          }`}
        >
          {support.mark}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-zinc-200">{claim.text}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Pill tone={support.tone}>{claim.supportLevel.toUpperCase()}</Pill>
            <Pill tone="neutral">{claim.claimType}</Pill>
            <TierPill tier={claim.bestTier} />
            {claim.isCoreClaim ? <Pill tone="neutral">core claim</Pill> : null}
          </div>

          {claim.supportedBy.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {claim.supportedBy.map((support_) => (
                <li key={support_.url} className="flex items-baseline gap-1.5 font-mono text-[11px]">
                  <span className="text-emerald-500">✓</span>
                  <a
                    href={support_.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sky-400 underline decoration-dotted hover:text-sky-300"
                  >
                    {support_.publisher}
                  </a>
                  {support_.trustTier ? (
                    <span className="text-zinc-600">tier {support_.trustTier}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 font-mono text-[11px] text-red-400">No supporting source.</p>
          )}

          {claim.conflictNote ? (
            <p className="mt-1.5 rounded border border-red-900/70 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">
              Conflict: {claim.conflictNote}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export default function VerificationSection({ run, story }: { run: RunState; story?: StoryState }) {
  const verification = story?.verification
  const extraction = story?.extraction
  const claims = verification?.claims ?? extraction?.claims

  return (
    <Card
      title="3 · Fact & claim verification"
      subtitle="NEWS_AGENT.md §7 steps 10-11 — extract atomic claims, then judge each against the evidence"
      right={
        verification ? (
          <Pill tone={verification.sufficient ? 'good' : 'bad'}>
            {verification.sufficient ? 'Sufficient to write' : (verification.reason ?? 'Insufficient')}
          </Pill>
        ) : null
      }
    >
      <div className="space-y-3">
        {verification ? (
          <div className="flex flex-wrap gap-2">
            <Pill tone="good">{verification.counts.verified} verified</Pill>
            <Pill tone="warn">{verification.counts.singleSource} single-source</Pill>
            <Pill tone="bad">{verification.counts.unsupported} unsupported</Pill>
            {verification.counts.conflicting > 0 ? (
              <Pill tone="bad">{verification.counts.conflicting} conflicting</Pill>
            ) : null}
          </div>
        ) : null}

        {extraction?.injectionFlagged || (extraction?.injectedClaimsDropped ?? 0) > 0 ? (
          <div className="rounded border border-amber-900/70 bg-amber-950/30 px-3 py-2">
            <p className="text-[11px] text-amber-200">
              Prompt-injection defence triggered: {extraction?.injectedClaimsDropped ?? 0} instruction-shaped
              “claim(s)” were dropped before they could reach the writer (§28).
            </p>
          </div>
        ) : null}

        {!claims || claims.length === 0 ? (
          <Empty>
            {run.status === 'running'
              ? 'Extracting and verifying claims…'
              : 'No claims were extracted — no story reached this stage.'}
          </Empty>
        ) : (
          <ul className="space-y-2">
            {claims.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
