import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission, getAuth } from '@/lib/auth'
import { planRefund, planFingerprint, directRefundGuard } from '@/lib/refund'

/*  Recording a refund against a booking.
 *
 *  TWO STEPS, AND THE SECOND ONE CANNOT DRIFT FROM THE FIRST. A refund moves
 *  money and moves tax, and the tax it moves is not proportional to the money —
 *  so the operator has to see the whole consequence before any of it is written.
 *  POST without `confirm` computes and returns; it touches nothing. POST with
 *  `confirm` set to the fingerprint from that preview recomputes from scratch
 *  and refuses if the answer has changed, which is what stops a figures
 *  correction in another tab from turning a confirmed $52.56 into something else
 *  between the two requests.
 *
 *  THE ROW IS THE REVERSAL. Nothing on the booking is edited down. The stay's
 *  own figures stay exactly as agreed and the refund sits beside them with its
 *  own date, so the books can always show $1,000 earned in July and $300 given
 *  back in August. A booking quietly rewritten to $700 can never tell you that.
 *
 *  THE MAT RETURNS NET THIS, and they net it per platform. The room reduction
 *  written below flows into the MAT report, the MAT return and the assistant's
 *  quarterly figure, so a refunded stay stops being taxed on money that was
 *  given back. What does NOT come off the host's return is an Airbnb MAT
 *  reversal, because Airbnb collected and remits that one — see
 *  refund_mat_yours. The single exception is the Toronto MAT report, held
 *  pending the VRBO/Airbnb audit and therefore not touched here. */

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

const ACCEPTED = new Set([
  'booking_id', 'booking_kind', 'amount', 'paid_at',
  'account_id', 'method', 'reference', 'note', 'confirm',
])

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to record refunds' }, { status: 403 })

  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
  const rejected = Object.keys(raw).filter(k => !ACCEPTED.has(k))
  if (rejected.length) return NextResponse.json({ error: 'Unexpected fields', rejected }, { status: 400 })

  const kind = raw.booking_kind
  if (kind !== 'platform' && kind !== 'direct') {
    return NextResponse.json({ error: "booking_kind must be 'platform' or 'direct'" }, { status: 400 })
  }
  if (!raw.booking_id) return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })

  const supabase = createAdminClient()
  const n = (v: any) => Number(v) || 0

  /* Both booking tables, normalised to the one shape the engine takes. */
  let b: any = null
  if (kind === 'platform') {
    const { data } = await supabase.from('calendar_blocks')
      .select('id, property_id, platform, start_date, end_date, guest_name, accommodation, discount, cleaning_fee, extras, apply_tax, status, is_booking')
      .eq('id', raw.booking_id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (!data.is_booking) return NextResponse.json({ error: 'That row is a block, not a booking — there is nothing to refund.' }, { status: 400 })
    b = {
      id: data.id, propertyId: data.property_id, platform: data.platform,
      checkIn: data.start_date, checkOut: data.end_date, guest: data.guest_name,
      accommodation: n(data.accommodation), discount: n(data.discount),
      cleaning: n(data.cleaning_fee), extras: n(data.extras),
      applyTax: data.apply_tax !== false, status: data.status,
    }
  } else {
    const { data } = await supabase.from('bookings')
      .select('id, property_id, check_in, check_out, booking_reference, accommodation, cleaning_fee, addon_fee, apply_tax, status, is_comp')
      .eq('id', raw.booking_id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (data.is_comp) return NextResponse.json({ error: 'A comped stay was never paid for, so there is nothing to refund.' }, { status: 400 })
    b = {
      id: data.id, propertyId: data.property_id, platform: null,
      checkIn: data.check_in, checkOut: data.check_out, guest: data.booking_reference,
      accommodation: n(data.accommodation), discount: 0,
      cleaning: n(data.cleaning_fee), extras: n(data.addon_fee),
      applyTax: data.apply_tax !== false, status: data.status,
    }
  }

  if (!b.checkIn || !b.checkOut) {
    return NextResponse.json({ error: 'The booking needs both dates before tax can be worked out.' }, { status: 400 })
  }
  const nights = Math.max(1, Math.round(
    (new Date(b.checkOut + 'T00:00:00Z').getTime() - new Date(b.checkIn + 'T00:00:00Z').getTime()) / 86400000))

  /*  The same guard the cancel path uses, and it was missing here entirely —
      this endpoint would have written a direct refund with tax on it. One rule,
      one place, called from both. */
  const guard = directRefundGuard(kind, b.applyTax, n(raw.amount))
  if (guard.blocked) {
    return NextResponse.json({
      error: guard.error, detail: guard.detail, blocked: guard.blocked_reason,
    }, { status: 409 })
  }

  const plan = planRefund({
    propertyId: b.propertyId, platform: b.platform, checkIn: b.checkIn, nights,
    applyTax: b.applyTax, accommodation: b.accommodation, discount: b.discount,
    cleaning: b.cleaning, extras: b.extras, refundRoom: n(raw.amount),
  })
  if (!plan.ok) return NextResponse.json(plan, { status: 400 })

  /* Refunds already recorded — so a second one is planned against what is left,
     and the operator can see they are not refunding the same money twice. */
  const { data: prior } = await supabase.from('payments')
    .select('id, amount, paid_at, reference, note')
    .eq('booking_id', b.id).eq('booking_kind', kind).eq('kind', 'refund')
  const priorTotal = r2((prior || []).reduce((t, p) => t + n(p.amount), 0))

  const fingerprint = planFingerprint(b.id, plan)
  const preview = {
    booking: {
      id: b.id, kind, guest: b.guest, property: b.propertyId,
      platform: b.platform || 'direct', check_in: b.checkIn, nights, status: b.status,
      apply_tax: b.applyTax,
    },
    room: plan.room,
    mat: plan.mat,
    hst: plan.hst,
    reversal: {
      tax_reversed_total: plan.taxReversed,
      you_reverse: plan.youReverse,
      platform_reverses: plan.platformReverses,
      who: b.platform === 'airbnb'
        ? 'Airbnb remits the MAT, so you reverse the HST only.'
        : 'Nobody remits on your behalf here, so you reverse both taxes.',
    },
    airbnb_mat_flag: plan.flag,
    cash_out: plan.cashOut,
    cash_out_explained: `${plan.room.reduction.toFixed(2)} room + ${plan.youReverse.toFixed(2)} tax you were holding`,
    prior_refunds: { count: (prior || []).length, total: priorTotal },
    workings: plan.workings,
    will_write: {
      table: 'payments', direction: 'out', kind: 'refund',
      booking_id: b.id, booking_kind: kind, amount: plan.cashOut,
      refund_room_reduction: plan.room.reduction,
      refund_hst_reversed: plan.hst.reversed,
      refund_mat_reversed: plan.mat.reversed,
      refund_mat_yours: String(b.platform || '').toLowerCase() === 'airbnb' ? 0 : plan.mat.reversed,
    },
    mat_return_effect: String(b.platform || '').toLowerCase() === 'airbnb'
      ? `Your MAT return does NOT change. The ${plan.mat.reversed.toFixed(2)} reversal is Airbnb's, `
        + `and netting it off your return would understate what you owe.`
      : `Your MAT return falls by ${plan.mat.reversed.toFixed(2)}.`,
    will_not_change: 'Nothing on the booking. Its figures stay as agreed; this row is the reversal.',
    not_yet_wired: b.propertyId === 'royal-york-east' || b.propertyId === 'royal-york-west'
      ? 'The Toronto MAT report is held pending the VRBO/Airbnb audit, so this reversal will not reach THAT report until it is unheld. The MAT return nets it correctly.'
      : null,
    fingerprint,
  }

  if (!raw.confirm) {
    return NextResponse.json({ ok: true, preview: true, wrote: false, ...preview })
  }

  /* ── confirm ──────────────────────────────────────────────────────────── */
  if (raw.confirm !== fingerprint) {
    return NextResponse.json({
      error: 'The booking changed since you previewed this refund.',
      detail: 'These are the numbers now. Read them and confirm again if they are still what you want.',
      confirm_you_sent: raw.confirm, fingerprint_now: fingerprint,
      ...preview,
    }, { status: 409 })
  }
  if (!raw.paid_at) return NextResponse.json({ error: 'A refund has a date it was paid on.' }, { status: 400 })

  /* Cash left an account, so the account is not optional — the same rule the
     payment-logging path uses. */
  if (!raw.account_id) {
    return NextResponse.json({
      error: 'Which account did the refund leave from?',
      detail: 'A refund is money out of a real account and the Accounts surface has to balance.',
    }, { status: 400 })
  }
  const { data: acct } = await supabase.from('bank_accounts')
    .select('id, name, active').eq('id', raw.account_id).maybeSingle()
  if (!acct) return NextResponse.json({ error: 'No such bank account' }, { status: 400 })
  if (!acct.active) return NextResponse.json({ error: `${acct.name} is not an active account` }, { status: 400 })

  const isAirbnbBooking = String(b.platform || '').toLowerCase() === 'airbnb'
  const who = await getAuth()
  const noteParts = [
    `Refund against ${b.guest || b.id}: ${plan.room.reduction.toFixed(2)} off the room `
      + `(${plan.room.before.toFixed(2)} to ${plan.room.after.toFixed(2)}).`,
    plan.taxReversed > 0
      ? `Tax recomputed on the new room: HST ${plan.hst.before.toFixed(2)} to ${plan.hst.after.toFixed(2)}, `
        + `MAT ${plan.mat.before.toFixed(2)} to ${plan.mat.after.toFixed(2)}. You reverse ${plan.youReverse.toFixed(2)}.`
      : 'No tax to reverse.',
    plan.flag || '',
    raw.note ? String(raw.note) : '',
  ].filter(Boolean)

  const { data: row, error } = await supabase.from('payments').insert({
    direction: 'out',
    booking_id: b.id, booking_kind: kind, invoice_id: null,
    kind: 'refund',
    amount: plan.cashOut,
    currency: 'CAD',
    status: 'paid',
    paid_at: new Date(raw.paid_at).toISOString(),
    account_id: raw.account_id,
    method: raw.method || null,
    reference: raw.reference || null,
    property_id: b.propertyId,
    /*  The reversal, written down rather than left to be re-derived. The MAT
        returns read refund_mat_yours, which is the whole reversal on VRBO,
        Houfy and direct and ZERO on Airbnb -- Airbnb collected that MAT and
        Airbnb reverses it, so taking it off the host's return would understate
        what the host owes. The distinction is frozen here, at the moment the
        operator confirmed a preview that said so. */
    refund_room_reduction: plan.room.reduction,
    refund_hst_reversed: plan.hst.reversed,
    refund_mat_reversed: plan.mat.reversed,
    refund_mat_yours: isAirbnbBooking ? 0 : plan.mat.reversed,
    note: noteParts.join(' '),
    created_by: who.ok ? who.userId : null,
  }).select('id, amount, paid_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, preview: false, wrote: true, payment: row, ...preview })
}
