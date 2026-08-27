/*  Netting refunds off a MAT return.
 *
 *  A refund reduces the room, and MAT is charged on the room, so a stay that was
 *  partly given back must stop being taxed on the part that was given back. Left
 *  unwired this overstates the return — the Tudor over-remittance again, only
 *  built in by design rather than arrived at by accident.
 *
 *  THE PER-PLATFORM RULE IS THE WHOLE POINT, and it cuts the opposite way to
 *  every other reversal in stage 2. On VRBO, Houfy and direct the host collected
 *  the MAT and remits it, so the host reverses it and the return falls. On
 *  Airbnb the host never held it: Airbnb collected it and Airbnb remits it, so
 *  reversing it is Airbnb's to do and it must NOT come off the host's return.
 *  Netting it there would understate what is owed, and understating a tax return
 *  is the worse of the two errors by a distance.
 *
 *  That decision is not made here. It was made when the refund was written, from
 *  the platform the operator saw in the preview, and stored as
 *  refund_mat_yours — the whole reversal off-Airbnb, zero on Airbnb. This reads
 *  that column rather than re-deriving from a platform value that may since have
 *  been edited.
 *
 *  Room reductions are returned separately from MAT because the reports
 *  apportion room revenue across the months a stay touches. Subtracting the room
 *  BEFORE apportioning is what keeps a refund landing in the same months the
 *  nights did, rather than all in the month the money went back. */

import type { SupabaseClient } from '@supabase/supabase-js'

export type RefundNetting = {
  /** booking id -> room given back, whoever remits. For display. */
  roomByBooking: Map<string, number>
  /*  booking id -> room given back whose MAT REVERSAL IS YOURS, and the only
      one a return may net. Zero for an Airbnb refund: the room genuinely fell,
      but the MAT on it was Airbnb's to collect and Airbnb's to give back, so
      taking it off your return understates what you owe. Netting the ROOM is
      how these reports reduce MAT, so gating the room is how the platform rule
      actually gets enforced -- gating only the MAT figure would leave the room
      shrinking and the reduction happening anyway. */
  roomForMatByBooking: Map<string, number>
  /** booking id -> MAT that comes off YOUR return (zero on Airbnb) */
  matYoursByBooking: Map<string, number>
  /** MAT reversed on Airbnb stays: real, and deliberately not netted */
  airbnbMatNotNetted: number
  airbnbRefundCount: number
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

export async function loadRefundNetting(
  supabase: SupabaseClient,
  bookingIds: string[],
): Promise<RefundNetting> {
  const empty: RefundNetting = {
    roomByBooking: new Map(), roomForMatByBooking: new Map(), matYoursByBooking: new Map(),
    airbnbMatNotNetted: 0, airbnbRefundCount: 0,
  }
  if (!bookingIds.length) return empty

  const { data } = await supabase.from('payments')
    .select('booking_id, refund_room_reduction, refund_mat_reversed, refund_mat_yours')
    .eq('kind', 'refund').eq('direction', 'out')
    .in('booking_id', bookingIds)

  const n = (v: any) => Number(v) || 0
  for (const p of data || []) {
    const id = p.booking_id as string
    if (!id) continue
    empty.roomByBooking.set(id, r2((empty.roomByBooking.get(id) || 0) + n(p.refund_room_reduction)))
    empty.matYoursByBooking.set(id, r2((empty.matYoursByBooking.get(id) || 0) + n(p.refund_mat_yours)))

    // whatever part of this reversal the platform holds rather than you
    const notYours = r2(n(p.refund_mat_reversed) - n(p.refund_mat_yours))
    if (notYours > 0.005) {
      empty.airbnbMatNotNetted = r2(empty.airbnbMatNotNetted + notYours)
      empty.airbnbRefundCount++
    } else {
      // the whole reversal is yours, so the room behind it may be netted. An
      // exempt stay lands here too with both figures at zero, which is right:
      // netting its room changes no MAT because no MAT was charged.
      empty.roomForMatByBooking.set(id, r2((empty.roomForMatByBooking.get(id) || 0) + n(p.refund_room_reduction)))
    }
  }
  return empty
}

/*  The room a stay is TAXED on after refunds, never below zero.
 *
 *  Deliberately reads roomForMatByBooking, not roomByBooking: only a refund
 *  whose MAT reversal is yours may reduce the MAT you owe. */
export function roomAfterRefunds(room: number, bookingId: string, net: RefundNetting): number {
  return Math.max(0, r2(room - (net.roomForMatByBooking.get(bookingId) || 0)))
}
