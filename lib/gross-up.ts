import { HST_RATE, matRate } from '@/lib/tax-rates'

/*  PRICING BACKWARDS: from what Katherine keeps, to what each platform lists.
 *
 *  Today the same cleaning job nets 363 on Airbnb, 311 on VRBO and 299 on Houfy,
 *  because three independent numbers were stored in three tables and called a
 *  price. This computes one list price per platform from ONE target net, so the
 *  three agree by construction.
 *
 *  THE DIVISOR IS NOT A SINGLE COMMISSION PERCENTAGE.
 *
 *    Airbnb   15.5% host-only, on the accommodation. Flat.
 *    Houfy    no host commission at all — the 17% a guest sees is TAX.
 *    VRBO     5% commission on the accommodation PLUS 3% payment processing on
 *             what the guest paid, which INCLUDES TAX. So VRBO's effective rate
 *             moves with the municipal rate: 8.51% where tax is 17%, more where
 *             it is higher. Storing "8%" would be wrong at every property and
 *             wrong again whenever a rate changes.
 *
 *  Verified to the cent against Amanda Stanek's VRBO booking: commission 149.05
 *  against 5% x 2,981.00 = 149.05, processing 106.25 against 3% x 3,541.99 =
 *  106.26.
 *
 *  AND THE TAX RATE DIFFERS BY FEE, which is why this takes a `kind`. MAT applies
 *  to the room only and then sits inside the HST base; cleaning and the rest carry
 *  HST alone. Using one blended rate would misprice both. */

export type Platform = 'airbnb' | 'vrbo' | 'houfy'
export type FeeKind = 'nightly' | 'cleaning' | 'pet' | 'extra_guest'

export type PlatformRate = {
  platform: Platform
  commissionPct: number
  processingPct: number
  processingOnTaxInclusive: boolean
}

/** Today's rates. Seeds platform_rates; editable there, not here. */
export const CURRENT_RATES: PlatformRate[] = [
  { platform: 'airbnb', commissionPct: 0.155, processingPct: 0,    processingOnTaxInclusive: false },
  { platform: 'vrbo',   commissionPct: 0.05,  processingPct: 0.03, processingOnTaxInclusive: true },
  { platform: 'houfy',  commissionPct: 0,     processingPct: 0,    processingOnTaxInclusive: false },
]

/** Tax as a fraction of this fee. MAT rides on the room only, inside the HST base. */
export function taxRateFor(propertyId: string, kind: FeeKind, on = new Date()): number {
  if (kind !== 'nightly') return HST_RATE
  const m = matRate(propertyId, on)
  return m + HST_RATE * (1 + m)
}

/** What a unit of this fee leaves behind, per dollar listed. */
export function divisorFor(rate: PlatformRate, taxRate: number): number {
  return 1 - rate.commissionPct - rate.processingPct * (rate.processingOnTaxInclusive ? 1 + taxRate : 1)
}

const r2 = (v: number) => Math.round(v * 100) / 100

export type Quote = {
  platform: Platform
  listPrice: number      // what the guest is charged
  platformKeeps: number
  net: number            // what reaches Katherine — equal across platforms by design
}

/** Gross a target net up to a list price per platform. */
export function quote(targetNet: number, propertyId: string, kind: FeeKind,
                      rates: PlatformRate[] = CURRENT_RATES, on = new Date()): Quote[] {
  const t = taxRateFor(propertyId, kind, on)
  return rates.map(rate => {
    const d = divisorFor(rate, t)
    const list = d > 0 ? targetNet / d : 0
    return { platform: rate.platform, listPrice: r2(list), platformKeeps: r2(list - list * d), net: r2(list * d) }
  })
}

/** The other direction: what a price LISTED today actually nets. */
export function netOf(listPrice: number, platform: Platform, propertyId: string, kind: FeeKind,
                      rates: PlatformRate[] = CURRENT_RATES, on = new Date()): number {
  const rate = rates.find(r => r.platform === platform)
  if (!rate) return listPrice
  return r2(listPrice * divisorFor(rate, taxRateFor(propertyId, kind, on)))
}
