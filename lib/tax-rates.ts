// Single source of truth for HST / MAT rates and the tax split.
//
// GOVERNING PRINCIPLE: remit what is OWED under the rules, not what the platform
// happened to collect. Where a platform under- or over-collects, the stored hst
// and mat are still the correct owed amounts; the variance is absorbed and noted.
//
// Port Colborne (Nickel Beach) — confirmed rules:
//   MAT 4% on ROOM ONLY (accommodation − discount). NOT cleaning, parking,
//   extras or any ancillary/service fee.
//   HST 13% stacks on top: MAT forms part of the consideration.
//   Provider remits BOTH for direct/Houfy.
//   MAT cap: 30 days / 29 nights. Longer stays are MAT-exempt.
//   Quarterly filing required even at zero (nil reports). Q3 Jul–Sep due Oct 15.
//
// Toronto (Royal York) — MAT was 8.5% Jun 1 2025 – Jul 31 2026, 6% from Aug 1 2026.

export const HST_RATE = 0.13

/**
 * Maximum TAXABLE nights. MAT applies to continuous stays of 30 days or less;
 * exemption begins at 31 days, i.e. 30 nights. So 29 nights is the last taxable
 * length and anything of 30+ nights is exempt.
 *
 * Toronto and Port Colborne share this rule (Toronto additionally applies to
 * stays of 4 hours or more).
 */
export const MAT_MAX_TAXABLE_NIGHTS = 29

/** Per-property override hook; both municipalities currently use the same rule. */
export const MAT_MAX_NIGHTS: Record<string, number> = {
  'nickel-beach': MAT_MAX_TAXABLE_NIGHTS,      // Port Colborne
  'royal-york-east': MAT_MAX_TAXABLE_NIGHTS,   // Toronto
  'royal-york-west': MAT_MAX_TAXABLE_NIGHTS,   // Toronto
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** MAT rate for a property on a given stay date. */
export function matRate(propertyId: string, stayDate: Date): number {
  if (propertyId === 'nickel-beach') return 0.04            // Port Colborne, flat
  // Toronto
  const t = stayDate.getTime()
  const hikeStart = Date.UTC(2025, 5, 1)    // Jun 1 2025
  const hikeEnd = Date.UTC(2026, 6, 31)     // Jul 31 2026 inclusive
  return (t >= hikeStart && t <= hikeEnd) ? 0.085 : 0.06
}

/** True when the stay is too long to be MAT-taxable (30+ nights). */
export function matExempt(propertyId: string, nights: number): boolean {
  return nights > (MAT_MAX_NIGHTS[propertyId] ?? MAT_MAX_TAXABLE_NIGHTS)
}

export type TaxSplitInput = {
  propertyId: string
  checkIn: string                  // YYYY-MM-DD
  nights: number
  accommodation: number
  discount?: number
  cleaning?: number
  /** Extras that form part of the accommodation supply (HST-taxable, never MAT). */
  hstTaxableExtras?: number
}

export type TaxSplit = {
  room: number
  matRate: number
  matExempt: boolean
  mat: number
  hstBase: number
  hst: number
  totalOwed: number
}

/**
 * MAT = rate × room only.
 * HST = 13% × (room + cleaning + HST-taxable extras + MAT).
 *
 * NOTE: whether `cleaning` belongs in the HST base is the one open question —
 * callers must pass it explicitly so the choice is always visible, never implied.
 */
export function computeTaxSplit(i: TaxSplitInput): TaxSplit {
  const room = round2((i.accommodation || 0) - (i.discount || 0))
  const rate = matRate(i.propertyId, new Date(i.checkIn + 'T00:00:00Z'))
  const exempt = matExempt(i.propertyId, i.nights)

  const mat = exempt ? 0 : round2(room * rate)
  const hstBase = round2(room + (i.cleaning || 0) + (i.hstTaxableExtras || 0) + mat)
  const hst = round2(hstBase * HST_RATE)

  return { room, matRate: rate, matExempt: exempt, mat, hstBase, hst, totalOwed: round2(hst + mat) }
}

/** Who remits what, given a computed split. */
export function remittanceSplit(
  platform: string | null | undefined,
  split: { hst: number; mat: number },
): { youRemit: number; platformRemits: number } {
  const p = String(platform || '').toLowerCase()
  if (p === 'airbnb') return { youRemit: split.hst, platformRemits: split.mat }  // Airbnb remits MAT
  // direct, houfy, and anything else: no platform remits on your behalf
  return { youRemit: round2(split.hst + split.mat), platformRemits: 0 }
}
