/** Billing period toggled by the Monthly / Annual control. */
export type BillingPeriod = 'monthly' | 'annual'

export interface PricingTier {
  name: string
  /** Display price per period, e.g. "$12" / "$9". */
  monthlyPrice: string
  annualPrice: string
  /** Suffix beside the price, e.g. "/month" vs "/mo, billed yearly". */
  monthlyUnit: string
  annualUnit: string
  blurb: string
  /** Corner tag, e.g. "Most popular"; empty string means none. */
  tag: string
  highlight: boolean
  cta: string
  features: string[]
}

/** One row of the plan comparison matrix — one cell per tier. */
export interface FeatureMatrixRow {
  label: string
  cells: string[]
}
