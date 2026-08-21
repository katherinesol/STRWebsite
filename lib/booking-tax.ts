// Per-booking tax rules and the apply_tax toggle.
//
// The settled model:
//   taxes_collected = taxes_you_remit + taxes_platform_remits  (TOTAL guest tax)
//   AIRBNB  — Airbnb remits MAT. you_remit = HST, platform_remits = MAT
//   VRBO    — explicit lines. you_remit = "taxes you remit", platform_remits = "we remit"
//   HOUFY   — collects no tax. you_remit = everything, platform_remits = 0
//   DIRECT  — mostly friends/family reimbursing supplies, NOT taxable by default.
//             Tax OFF unless explicitly toggled on. If toggled ON it behaves like
//             Houfy: no platform remits anything, so you remit HST + MAT.
//
// apply_tax = false means: zero tax for tax reporting, and the booking drops out
// of MAT/HST filings — but it STILL counts as income (accommodation + fees).

export const PLATFORMS_WITH_TAX = ['airbnb', 'vrbo', 'houfy'] as const

export type BookingSource = 'platform' | 'direct'

/** Default toggle state for a booking that has never been set explicitly. */
export function defaultApplyTax(source: BookingSource, platform?: string | null): boolean {
  if (source === 'direct') return false
  return PLATFORMS_WITH_TAX.includes(String(platform || '').toLowerCase() as any)
}

/** Resolve the toggle: an explicit value wins; otherwise fall back to the default. */
export function resolveApplyTax(
  applyTax: boolean | null | undefined,
  source: BookingSource,
  platform?: string | null,
): boolean {
  return applyTax == null ? defaultApplyTax(source, platform) : applyTax
}

export type TaxFields = {
  taxes_collected?: number | null
  taxes_you_remit?: number | null
  taxes_platform_remits?: number | null
  hst?: number | null
  mat?: number | null
}

export type EffectiveTax = {
  applied: boolean
  taxes_collected: number
  taxes_you_remit: number
  taxes_platform_remits: number
  hst: number
  mat: number
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0)

/**
 * Tax figures to use for TAX REPORTING (MAT/HST filings).
 * When the toggle is off every field reads as 0 — the stored values are left
 * untouched so toggling back on restores them.
 */
export function effectiveTax(
  b: TaxFields,
  applyTax: boolean | null | undefined,
  source: BookingSource,
  platform?: string | null,
): EffectiveTax {
  const applied = resolveApplyTax(applyTax, source, platform)
  if (!applied) {
    return { applied: false, taxes_collected: 0, taxes_you_remit: 0, taxes_platform_remits: 0, hst: 0, mat: 0 }
  }
  return {
    applied: true,
    taxes_collected: num(b.taxes_collected),
    taxes_you_remit: num(b.taxes_you_remit),
    taxes_platform_remits: num(b.taxes_platform_remits),
    hst: num(b.hst),
    mat: num(b.mat),
  }
}

/**
 * Income is INDEPENDENT of the tax toggle — a reimbursement is still money in.
 * Reports should keep counting these bookings even when apply_tax is false.
 */
export function incomeBase(b: {
  accommodation?: number | null; cleaning_fee?: number | null
  extras?: number | null; discount?: number | null
}): number {
  return num(b.accommodation) - num(b.discount) + num(b.cleaning_fee) + num(b.extras)
}

/** Human explanation of what the toggle is doing, for the editor UI. */
export function taxToggleExplainer(applied: boolean, source: BookingSource, platform?: string | null): string {
  if (!applied) {
    return source === 'direct'
      ? 'No tax applied. Counts as income, excluded from HST/MAT filings. Default for direct bookings (reimbursements).'
      : 'No tax applied. Counts as income, excluded from HST/MAT filings.'
  }
  const p = String(platform || '').toLowerCase()
  if (p === 'airbnb') return 'Tax applies. Airbnb remits MAT; you remit HST.'
  if (p === 'vrbo') return 'Tax applies. Split per VRBO’s "you remit" / "we remit" lines.'
  if (p === 'houfy') return 'Tax applies. Houfy remits nothing — you remit HST + MAT.'
  return 'Tax applies. No platform remits on your behalf — you remit HST + MAT.'
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation
//
// Two different questions, previously conflated in one formula:
//   1. CASH  — does the payout match what the platform actually collected?
//   2. TAX   — what do I owe the government?
//
// taxes_you_remit means "what I remit" (the OWED amount, used for filing), so it
// must NOT be used to reconcile cash. Cash reconciles against the tax the
// platform actually collected and passed through to me. The gap between owed and
// collected is an "absorbed shortfall" — legitimate and expected, not an error.
// ─────────────────────────────────────────────────────────────────────────────

export type ReconcileInput = {
  accommodation?: number | null; discount?: number | null
  cleaning_fee?: number | null; extras?: number | null
  commission?: number | null; host_service_fee?: number | null
  payment_processing_fee?: number | null
  taxes_collected?: number | null; taxes_platform_remits?: number | null
  hst?: number | null; mat?: number | null
  payout_amount?: number | null
}

export type Reconciliation = {
  cashCalc: number
  payout: number
  cashDelta: number
  reconciles: boolean
  taxOwed: number
  taxCollected: number
  /** owed − collected. Positive = platform under-collected, you absorb it. */
  absorbedShortfall: number
  fee: number
  feeSource: 'commission' | 'host_service_fee' | 'none'
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function reconcileBooking(b: ReconcileInput, tolerance = 0.02): Reconciliation {
  const fee = num(b.commission) !== 0 ? num(b.commission)
            : num(b.host_service_fee) !== 0 ? num(b.host_service_fee) : 0
  const feeSource = num(b.commission) !== 0 ? 'commission'
                  : num(b.host_service_fee) !== 0 ? 'host_service_fee' : 'none'

  // only the tax the platform passed through to me flows through the payout
  const taxPassedThrough = num(b.taxes_collected) - num(b.taxes_platform_remits)

  const cashCalc = r2(
    num(b.accommodation) - num(b.discount) + num(b.cleaning_fee) + num(b.extras)
    + taxPassedThrough - fee - num(b.payment_processing_fee)
  )
  const payout = num(b.payout_amount)
  const cashDelta = r2(cashCalc - payout)

  const taxOwed = r2(num(b.hst) + num(b.mat))
  const taxCollected = num(b.taxes_collected)

  return {
    cashCalc, payout, cashDelta,
    reconciles: Math.abs(cashDelta) <= tolerance,
    taxOwed, taxCollected,
    absorbedShortfall: r2(taxOwed - taxCollected),
    fee, feeSource: feeSource as Reconciliation['feeSource'],
  }
}
