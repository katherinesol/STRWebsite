/*  Reversing money on a booking.
 *
 *  A refund is not a negative booking and not a deleted one. The stay happened
 *  or it did not, but either way the figures on the row are what was originally
 *  agreed, and they stay there — the reversal is a separate, dated fact sitting
 *  beside them. That is what makes it auditable: you can always see that $1,000
 *  was earned in July and $300 given back in August, which a row edited down to
 *  $700 can never tell you.
 *
 *  RECOMPUTE, NEVER SCALE. This is the mechanism the Tudor Bertiean
 *  reconciliation turned on, and it is the whole reason this file is pure and
 *  separately testable. A refund reduces the ROOM. Tax is then worked out again
 *  from the new room, because the other components do not move with it: on a
 *  $1,000 room with $200 cleaning at Nickel Beach, refunding $300 drops the room
 *  by 30% but the HST by only 25% — $161.20 to $120.64 — because the cleaning is
 *  still in the base and still taxed. Scaling the tax by 300/1000 gives $112.84,
 *  which is $7.80 wrong and wrong in the direction that underpays.
 *
 *  WHO REVERSES WHAT DEPENDS ON THE PLATFORM, and the asymmetry is real money.
 *  On VRBO, Houfy and direct bookings the host holds and remits both taxes, so
 *  the host reverses both. On Airbnb the MAT was never the host's — Airbnb
 *  collected and remits it — so the host reverses only the HST. What this file
 *  will NOT do is assert that Airbnb reversed its share. It has no way to know,
 *  and quietly assuming it produces a MAT return that is short by exactly that
 *  amount with nothing on screen to say why. It raises a flag instead, and the
 *  flag is the output.
 */

import { computeTaxSplit, remittanceSplit } from '@/lib/tax-rates'

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

export type RefundInput = {
  propertyId: string
  platform: string | null       // 'airbnb' | 'vrbo' | 'houfy' | null for direct
  checkIn: string               // yyyy-mm-dd
  nights: number
  applyTax: boolean
  accommodation: number
  discount: number
  cleaning: number
  extras: number
  refundRoom: number            // the reduction against the room, always positive
}

export type RefundPlan =
  | { ok: false; error: string; detail?: string }
  | {
      ok: true
      room: { before: number; after: number; reduction: number }
      mat: { before: number; after: number; reversed: number; rate: number; exempt: boolean }
      hst: { before: number; after: number; reversed: number }
      taxReversed: number
      youReverse: number
      platformReverses: number
      flag: string | null
      cashOut: number
      workings: Record<string, any>
    }

export function planRefund(i: RefundInput): RefundPlan {
  const refund = r2(Number(i.refundRoom))
  if (!Number.isFinite(refund) || refund <= 0) {
    return { ok: false, error: 'A refund is a positive amount.', detail: 'Money coming in is a payment, not a refund.' }
  }
  const roomBefore = r2(Number(i.accommodation) - Number(i.discount))
  if (refund > roomBefore + 0.005) {
    return {
      ok: false,
      error: `The refund is larger than the room.`,
      detail: `The room is ${roomBefore.toFixed(2)} after discount; ${refund.toFixed(2)} cannot come off it. `
        + `Refunds are always against the room, never the cleaning fee or the tax.`,
    }
  }

  const common = {
    propertyId: i.propertyId, checkIn: i.checkIn, nights: i.nights,
    discount: Number(i.discount), cleaning: Number(i.cleaning), hstTaxableExtras: Number(i.extras),
  }
  const before = computeTaxSplit({ ...common, accommodation: Number(i.accommodation) })
  const after = computeTaxSplit({ ...common, accommodation: r2(Number(i.accommodation) - refund) })

  // apply_tax off means there was no tax to reverse, not that it reverses to zero
  const bMat = i.applyTax ? before.mat : 0
  const aMat = i.applyTax ? after.mat : 0
  const bHst = i.applyTax ? before.hst : 0
  const aHst = i.applyTax ? after.hst : 0

  const matReversed = r2(bMat - aMat)
  const hstReversed = r2(bHst - aHst)

  // the same rule that decides who REMITS decides who REVERSES
  const who = remittanceSplit(i.platform, { hst: hstReversed, mat: matReversed })

  const isAirbnb = String(i.platform || '').toLowerCase() === 'airbnb'
  const flag = isAirbnb && matReversed > 0
    ? `Airbnb collected and remits the MAT, so ${matReversed.toFixed(2)} of reversal is theirs, not yours. `
      + `CONFIRM Airbnb actually reversed it — this is not assumed here, and your MAT return will be short by `
      + `that amount if they did not.`
    : null

  return {
    ok: true,
    room: { before: roomBefore, after: r2(roomBefore - refund), reduction: refund },
    mat: { before: bMat, after: aMat, reversed: matReversed, rate: before.matRate, exempt: before.matExempt },
    hst: { before: bHst, after: aHst, reversed: hstReversed },
    taxReversed: r2(matReversed + hstReversed),
    youReverse: r2(who.youRemit),
    platformReverses: r2(who.platformRemits),
    flag,
    // what actually leaves your account: the room you gave back, plus the tax
    // you were holding. Tax the platform holds is not yours to return.
    cashOut: r2(refund + who.youRemit),
    workings: {
      nights: i.nights, apply_tax: i.applyTax,
      mat_rate: before.matRate, mat_exempt: before.matExempt,
      hst_base_before: i.applyTax ? before.hstBase : 0,
      hst_base_after: i.applyTax ? after.hstBase : 0,
      recompute_not_scale: {
        room_fell_by: `${r2((refund / (roomBefore || 1)) * 100)}%`,
        hst_fell_by: bHst ? `${r2((hstReversed / bHst) * 100)}%` : '0%',
        scaling_would_give: bHst ? r2(bHst * (1 - refund / (roomBefore || 1))) : 0,
        which_is_wrong_by: bHst ? r2(aHst - bHst * (1 - refund / (roomBefore || 1))) : 0,
      },
    },
  }
}

/*  The fingerprint the caller must echo to confirm.
 *
 *  Preview and write are two requests, and between them the booking can change —
 *  a figures correction, another refund, an edit in a second tab. Without this,
 *  the confirm writes whatever the numbers are NOW while the operator is looking
 *  at what they were THEN. Hashing the plan means a changed booking produces a
 *  changed fingerprint and the write is refused rather than silently applied to
 *  a different set of numbers. */
export function planFingerprint(bookingId: string, plan: RefundPlan): string {
  if (!plan.ok) return ''
  const material = [
    bookingId, plan.room.before, plan.room.reduction,
    plan.mat.reversed, plan.hst.reversed, plan.youReverse, plan.cashOut,
  ].join('|')
  let h = 0
  for (let i = 0; i < material.length; i++) { h = ((h << 5) - h + material.charCodeAt(i)) | 0 }
  return Math.abs(h).toString(36)
}
