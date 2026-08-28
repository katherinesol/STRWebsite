import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission, getAuth } from '@/lib/auth'
import { planRefund, planFingerprint, directRefundGuard } from '@/lib/refund'
import { decideLock, dateEffect } from '@/lib/cancellation'
import { logSystem } from '@/lib/system-log'
import { queueForBooking } from '@/lib/lock-queue'

/*  Cancel or refund — one action, and one question decides everything it does.
 *
 *  DID THE GUEST STAY? Not "how much", because the amount cannot tell you. The
 *  same $300 is a cancellation on a guest who never arrived and a goodwill
 *  gesture to one who did, and the two want opposite handling: the first reopens
 *  dates and kills a door code, the second must touch neither. Offering the
 *  dates of a stay that actually happened to the next booker, or revoking the
 *  code of a guest still in the house, are both one wrong inference away. So it
 *  is asked, never derived.
 *
 *  NOTHING IS WRITTEN WITHOUT A MATCHING FINGERPRINT. The preview names every
 *  consequence with figures; the confirm echoes a hash of the plan. A booking
 *  edited between the two produces a different hash and the write is refused
 *  rather than applied to numbers nobody approved.
 *
 *  DIRECT BOOKINGS MOVE MONEY ONLY WHERE THERE IS NO TAX IN IT. The reversal
 *  computes identically to VRBO on a direct booking; what does not hold is the
 *  MAT return, which reads calendar_blocks and has never read the bookings
 *  table. So a direct refund that would reverse tax is refused — see
 *  directRefundGuard — and one with apply_tax off, which reverses room and
 *  nothing else, goes through. The refusal is in code rather than in a document
 *  nobody reads at the moment it matters. */

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

const ACCEPTED = new Set([
  'booking_id', 'booking_kind', 'stayed', 'mode', 'amount', 'reason',
  'paid_at', 'account_id', 'method', 'reference', 'confirm',
])

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to cancel or refund' }, { status: 403 })

  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
  const rejected = Object.keys(raw).filter(k => !ACCEPTED.has(k))
  if (rejected.length) return NextResponse.json({ error: 'Unexpected fields', rejected }, { status: 400 })

  const kind = raw.booking_kind
  if (kind !== 'platform' && kind !== 'direct') {
    return NextResponse.json({ error: "booking_kind must be 'platform' or 'direct'" }, { status: 400 })
  }
  if (!raw.booking_id) return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
  if (typeof raw.stayed !== 'boolean') {
    return NextResponse.json({
      error: 'Did the guest stay?',
      detail: 'This decides whether the dates reopen and the door code is revoked. It is never inferred from the amount.',
    }, { status: 400 })
  }
  const mode = raw.mode || 'full'
  if (!['full', 'partial', 'none'].includes(mode)) {
    return NextResponse.json({ error: "mode must be 'full', 'partial' or 'none'" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const n = (v: any) => Number(v) || 0

  let b: any = null
  if (kind === 'platform') {
    const { data } = await supabase.from('calendar_blocks')
      .select('id, property_id, platform, start_date, end_date, guest_name, accommodation, discount, cleaning_fee, extras, apply_tax, status, is_booking, door_code')
      .eq('id', raw.booking_id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (!data.is_booking) return NextResponse.json({ error: 'That row is a block, not a booking.' }, { status: 400 })
    b = {
      id: data.id, propertyId: data.property_id, platform: data.platform,
      checkIn: data.start_date, checkOut: data.end_date, guest: data.guest_name,
      accommodation: n(data.accommodation), discount: n(data.discount),
      cleaning: n(data.cleaning_fee), extras: n(data.extras),
      applyTax: data.apply_tax !== false, status: data.status, code: data.door_code,
    }
  } else {
    const { data } = await supabase.from('bookings')
      .select('id, property_id, check_in, check_out, booking_reference, accommodation, cleaning_fee, addon_fee, apply_tax, status, is_comp, lock_code')
      .eq('id', raw.booking_id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    b = {
      id: data.id, propertyId: data.property_id, platform: null,
      checkIn: data.check_in, checkOut: data.check_out, guest: data.booking_reference,
      accommodation: n(data.accommodation), discount: 0,
      cleaning: n(data.cleaning_fee), extras: n(data.addon_fee),
      applyTax: data.apply_tax !== false, status: data.status, code: data.lock_code,
      isComp: data.is_comp,
    }
  }
  if (b.status === 'cancelled') {
    return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 })
  }
  if (!b.checkIn || !b.checkOut) {
    return NextResponse.json({ error: 'The booking needs both dates before this can be worked out.' }, { status: 400 })
  }

  const stayed: boolean = raw.stayed
  const roomBilled = r2(b.accommodation - b.discount)

  /* What comes off the room, resolved from the mode. A kept fee and a refund are
     the same arithmetic seen from opposite ends, and conflating them in the UI is
     how someone refunds the fee they meant to keep. */
  let refundRoom = 0
  let moneyLabel = ''
  if (mode === 'none') {
    refundRoom = 0
    moneyLabel = 'No money moves.'
    if (stayed) return NextResponse.json({ error: 'A goodwill refund with no amount does nothing. Give an amount, or keep the booking.' }, { status: 400 })
  } else if (stayed) {
    refundRoom = r2(n(raw.amount))
    moneyLabel = `Goodwill refund of ${refundRoom.toFixed(2)} off the room.`
  } else if (mode === 'full') {
    refundRoom = roomBilled
    moneyLabel = `The whole room, ${roomBilled.toFixed(2)}, comes back.`
  } else {
    const kept = r2(n(raw.amount))
    if (kept < 0) return NextResponse.json({ error: 'A kept fee is a positive amount.' }, { status: 400 })
    if (kept > roomBilled) return NextResponse.json({ error: `You cannot keep ${kept.toFixed(2)} of a ${roomBilled.toFixed(2)} room.` }, { status: 400 })
    refundRoom = r2(roomBilled - kept)
    moneyLabel = `${kept.toFixed(2)} kept, ${refundRoom.toFixed(2)} returned.`
  }

  /*  THE DIRECT-BOOKING GUARD, narrowed. It used to refuse every direct refund
      on the grounds that the path was unverified. It has since been verified —
      the arithmetic is byte-identical to VRBO — and what remains is narrower and
      real: direct tax never reaches the MAT return. So only a direct booking
      that actually charges tax is refused. See directRefundGuard. */
  const guard = directRefundGuard(kind, b.applyTax, refundRoom)
  if (guard.blocked) {
    return NextResponse.json({
      error: guard.error, detail: guard.detail, blocked: guard.blocked_reason,
    }, { status: 409 })
  }

  const nights = Math.max(1, Math.round(
    (new Date(b.checkOut + 'T00:00:00Z').getTime() - new Date(b.checkIn + 'T00:00:00Z').getTime()) / 86400000))

  const plan = refundRoom > 0
    ? planRefund({
        propertyId: b.propertyId, platform: b.platform, checkIn: b.checkIn, nights,
        applyTax: b.applyTax, accommodation: b.accommodation, discount: b.discount,
        cleaning: b.cleaning, extras: b.extras, refundRoom,
      })
    : null
  if (plan && !plan.ok) return NextResponse.json(plan, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const lock = decideLock({ stayed, endDate: b.checkOut, today, code: b.code })
  const dates = dateEffect(kind, b.platform, stayed)
  const isAirbnb = String(b.platform || '').toLowerCase() === 'airbnb'

  const fingerprint = [
    planFingerprint(b.id, plan || ({ ok: true } as any)),
    stayed ? 'S' : 'C', mode, refundRoom.toFixed(2), lock.action, b.status,
  ].join('.')

  const preview = {
    booking: {
      id: b.id, kind, guest: b.guest, property: b.propertyId,
      platform: b.platform || 'direct', check_in: b.checkIn, check_out: b.checkOut,
      nights, status_now: b.status,
    },
    answer: stayed
      ? 'The guest STAYED. This is a goodwill refund, not a cancellation.'
      : 'The guest did NOT stay. This cancels the booking.',
    money: plan ? {
      label: moneyLabel,
      room: plan.room, mat: plan.mat, hst: plan.hst,
      tax_reversed_total: plan.taxReversed,
      you_reverse: plan.youReverse,
      platform_reverses: plan.platformReverses,
      cash_out: plan.cashOut,
      cash_out_explained: `${plan.room.reduction.toFixed(2)} room + ${plan.youReverse.toFixed(2)} tax you were holding`,
      airbnb_mat_flag: plan.flag,
      mat_return_effect: isAirbnb
        ? `Your MAT return does NOT change. The ${plan.mat.reversed.toFixed(2)} reversal is Airbnb's.`
        : `Your MAT return falls by ${plan.mat.reversed.toFixed(2)}.`,
    } : { label: moneyLabel, cash_out: 0 },
    dates: { frees: dates.frees, message: dates.message },
    locks: { action: lock.action, code: lock.code, message: lock.reason },
    status: stayed
      ? { from: b.status, to: b.status, message: 'Status is unchanged — the stay happened.' }
      : { from: b.status, to: 'cancelled', message: 'Marked cancelled. The figures stay on the row; they stop counting.' },
    toronto_mat_caveat: (b.propertyId === 'royal-york-east' || b.propertyId === 'royal-york-west') && plan && plan.mat.reversed > 0
      ? 'The Toronto MAT report is held pending the VRBO/Airbnb audit, so this reversal will not reach that one report.'
      : null,
    fingerprint,
  }

  if (!raw.confirm) return NextResponse.json({ ok: true, preview: true, wrote: false, ...preview })

  /* ── confirm ──────────────────────────────────────────────────────────── */
  if (raw.confirm !== fingerprint) {
    return NextResponse.json({
      error: 'The booking changed since you previewed this.',
      detail: 'These are the consequences now. Read them and confirm again if they are still what you want.',
      confirm_you_sent: raw.confirm, fingerprint_now: fingerprint, ...preview,
    }, { status: 409 })
  }
  if (!stayed && !raw.reason) return NextResponse.json({ error: 'A cancellation needs a reason.' }, { status: 400 })

  const who = await getAuth()
  const done: Record<string, any> = {}

  /*  MONEY FIRST. It is the part that must not be lost, and the two steps after
      it are recoverable by hand where a missing refund row is not. */
  if (plan && plan.ok) {
    if (!raw.paid_at) return NextResponse.json({ error: 'A refund has a date it was paid on.' }, { status: 400 })
    if (!raw.account_id) return NextResponse.json({ error: 'Which account did the refund leave from?' }, { status: 400 })
    const { data: acct } = await supabase.from('bank_accounts').select('id, name, active').eq('id', raw.account_id).maybeSingle()
    if (!acct) return NextResponse.json({ error: 'No such bank account' }, { status: 400 })
    if (!acct.active) return NextResponse.json({ error: `${acct.name} is not an active account` }, { status: 400 })

    const { data: row, error } = await supabase.from('payments').insert({
      direction: 'out', booking_id: b.id, booking_kind: kind, invoice_id: null,
      kind: 'refund', amount: plan.cashOut, currency: 'CAD', status: 'paid',
      paid_at: new Date(raw.paid_at).toISOString(),
      account_id: raw.account_id, method: raw.method || null, reference: raw.reference || null,
      property_id: b.propertyId,
      refund_room_reduction: plan.room.reduction,
      refund_hst_reversed: plan.hst.reversed,
      refund_mat_reversed: plan.mat.reversed,
      refund_mat_yours: isAirbnb ? 0 : plan.mat.reversed,
      note: [
        stayed ? 'Goodwill refund' : `Cancellation (${mode})`,
        `${plan.room.reduction.toFixed(2)} off the room (${plan.room.before.toFixed(2)} to ${plan.room.after.toFixed(2)}).`,
        plan.taxReversed > 0 ? `You reverse ${plan.youReverse.toFixed(2)}.` : 'No tax to reverse.',
        plan.flag || '', raw.reason ? String(raw.reason) : '',
      ].filter(Boolean).join(' '),
      created_by: who.ok ? who.userId : null,
    }).select('id, amount').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    done.refund = row
  }

  if (!stayed) {
    const table = kind === 'platform' ? 'calendar_blocks' : 'bookings'
    const { error } = await supabase.from(table).update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: String(raw.reason),
    }).eq('id', b.id)
    if (error) return NextResponse.json({ error: `The refund was recorded but the status did not change: ${error.message}`, done }, { status: 500 })
    done.status = 'cancelled'
  }

  /*  THE LOCK LAST, AND NON-FATAL. A Seam call can fail for reasons that have
      nothing to do with this booking, and a failed revoke must not roll back a
      refund that already left the bank. It is reported instead, where it can be
      seen and done by hand. */
  if (lock.action === 'revoke' && lock.code) {
    /*  QUEUE THE REVOKE. The server cannot reach a lock, so it records the
     *  intent and the worker removes the code.
     *
     *  STILL NON-FATAL, for the original reason: a lock problem must never roll
     *  back a refund that has already left the bank. But the failure mode has
     *  changed shape. Before, revokeCodeFromProperty swallowed every per-lock
     *  error and returned as though it had worked, and this block wrote
     *  "Revoked code 5105" into the log — an assertion about a door that was
     *  still open. Now the only thing that can fail here is WRITING DOWN the
     *  intent, which is loud, and the queue retries the rest.
     *
     *  THE GAP IS REAL AND WORTH NAMING: a cancellation at 2am revokes nothing
     *  until the next drain. The code stays live in the meantime. That is a
     *  security-relevant delay, so it is logged as an alert rather than a quiet
     *  success, and the drain cadence is what bounds it. */
    const queued = await queueForBooking({
      bookingId: b.id,
      bookingKind: kind,
      propertyId: b.propertyId,
      platform: b.platform,
      action: 'revoke',
      code: lock.code,
      who: `${b.guest || b.id} (cancelled ${b.checkIn}–${b.checkOut})`,
    })

    done.lock = {
      queued: queued.queued, skipped: queued.skipped, failed: queued.failed,
      ok: queued.ok,
      note: 'Revoke queued. The code stays live on the door until the worker next runs.',
    }

    await logSystem(
      queued.ok ? 'lock.revoke_queued' : 'lock.revoke_failed',
      queued.ok
        ? `Queued revoke of code ${lock.code} on ${queued.queued.length} lock(s) — ${b.guest || b.id} cancelled (${b.checkIn}–${b.checkOut}). NOT yet removed from the door.`
        : `Could NOT queue the revoke of ${lock.code} for cancelled booking ${b.id}. Remove it by hand.`,
      { booking_id: b.id, code: lock.code, queued: queued.queued, failed: queued.failed }, b.propertyId)
  } else {
    done.lock = { skipped: lock.reason }
  }

  await logSystem(stayed ? 'booking.refunded' : 'booking.cancelled',
    `${b.guest || b.id}: ${stayed ? 'goodwill refund' : 'cancelled'}. ${moneyLabel} ${raw.reason ? String(raw.reason) : ''}`,
    { booking_id: b.id, kind, stayed, mode, cash_out: plan?.cashOut || 0 }, b.propertyId)

  return NextResponse.json({ ok: true, preview: false, wrote: true, done, ...preview })
}
