import type { FeatureMatrixRow, PricingTier } from '@/types/pricing'

/* TEMPORARY mock data — ported from `tiers` / `matrixRows` in the handoff. */

export const PRICING_TIERS: PricingTier[] = [
  {
    name: 'Free',
    monthlyPrice: '$0',
    annualPrice: '$0',
    monthlyUnit: 'forever',
    annualUnit: 'forever',
    blurb: 'The whole catalog, searchable, with dated editor notes.',
    tag: '',
    highlight: false,
    cta: 'Create free account',
    features: [
      'Full catalog and search',
      'Side-by-side comparison of 3 tools',
      'Weekly new-tools digest',
      '5 saved tools',
    ],
  },
  {
    name: 'Pro',
    monthlyPrice: '$12',
    annualPrice: '$9',
    monthlyUnit: '/month',
    annualUnit: '/mo, billed yearly',
    blurb: 'Recommendations built from the stack you already run.',
    tag: 'Most popular',
    highlight: true,
    cta: 'Start 14-day trial',
    features: [
      'Everything in Free',
      'Stack-aware recommendations',
      'Unlimited saved stacks',
      'Compare up to 8 tools',
      'Price-change and shutdown alerts',
      'Full test-run data and exports',
    ],
  },
  {
    name: 'Team',
    monthlyPrice: '$29',
    annualPrice: '$24',
    monthlyUnit: '/seat/month',
    annualUnit: '/seat/mo, yearly',
    blurb: 'For teams that have to justify the tools they buy.',
    tag: '',
    highlight: false,
    cta: 'Talk to us',
    features: [
      'Everything in Pro',
      'Shared stacks and internal notes',
      'Procurement-ready comparison PDFs',
      'SSO and audit log',
      'Spend overlap report',
      'Named account contact',
    ],
  },
]

export const TIER_NAMES: string[] = PRICING_TIERS.map((t) => t.name)

export const FEATURE_MATRIX_ROWS: FeatureMatrixRow[] = [
  { label: 'Catalog and search', cells: ['✓', '✓', '✓'] },
  { label: 'Tools compared at once', cells: ['3', '8', '8'] },
  { label: 'Saved stacks', cells: ['5 tools', 'Unlimited', 'Unlimited + shared'] },
  { label: 'Stack-aware recommendations', cells: ['—', '✓', '✓'] },
  { label: 'Price-change alerts', cells: ['—', '✓', '✓'] },
  { label: 'Test-run data export', cells: ['—', 'CSV', 'CSV + API'] },
  { label: 'Procurement PDFs', cells: ['—', '—', '✓'] },
  { label: 'SSO and audit log', cells: ['—', '—', '✓'] },
  { label: 'Support', cells: ['Community', 'Email, 1 day', 'Named contact'] },
]

export const BILLING_LABELS = {
  monthly: 'Monthly',
  annual: 'Annual · save 25%',
} as const
