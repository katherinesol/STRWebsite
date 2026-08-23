import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth'

/** Editing a direct booking.
 *
 *  This was `isAuthed()` and `update({ ...body })` — no role check and no column
 *  filter, so any signed-in account could set status:'cancelled', rewrite total,
 *  or type any figure it liked into hst and mat on any real booking. Same shape
 *  of hole as the calendar block PATCH, closed the same way.
 *
 *  TWO KINDS OF MONEY, and the difference is the whole point of the split.
 *
 *  COMPUTED money is derived from the tax rules: accommodation and cleaning feed
 *  HST and MAT, which feed total. Those are not opinions you type — MAT is 6% in
 *  Toronto and 4% at Nickel Beach, and a stay over 29 nights is exempt entirely.
 *  The old edit form hardcoded `accom * 0.04` for every property and never called
 *  matExempt, so a Royal York booking saved through it recorded $400 of MAT where
 *  the rules say $600. Nothing here may write those columns; they move only
 *  through the figures endpoint, which computes them.
 *
 *  RECORDED money is what actually moved: the payment schedule and its paid_at
 *  stamps. Marking a deposit received is bookkeeping, not arithmetic, and it is a
 *  daily action — blocking it would break the three "mark paid" buttons for no
 *  safety gain, because none of those columns is what the 4% bug corrupts. */

const COMPUTED = [
  'accommodation', 'cleaning_fee', 'hst', 'mat', 'total',
  'apply_tax', 'tax_toggle_note',
] as const

const EDITABLE = new Set([
  // the stay
  'check_in', 'check_out', 'nights', 'guests', 'guests_adults', 'guests_children',
  // arrival and departure arrangements
  'early_checkin', 'early_checkin_time', 'early_checkin_granted',
  'late_checkout', 'late_checkout_time', 'late_checkout_granted',
  'bag_drop', 'instacart_requested', 'vehicle_count', 'plate_numbers', 'plates_pending',
  // lock_code only. bookings has no door_code column — that is calendar_blocks'
  // name for the same thing, and admitting it here let a phantom key through the
  // allowlist to fail at the database instead of being refused cleanly.
  'lock_code', 'checked_in_at',
  // guest-supplied, guest-visible
  'trip_purpose', 'trip_purpose_note',
  // lifecycle
  'status', 'cancellation_reason', 'cancelled_at',
  // recorded money — what moved, not what the rules compute
  'payment_method', 'security_deposit_status',
  'deposit_amount', 'deposit_paid_at',
  'second_payment_amount', 'second_due_date', 'second_paid_at',
  'final_payment_amount', 'final_due_date', 'final_paid_at',
  // notes
  'tax_note',
])

const NUMERIC = ['deposit_amount', 'second_payment_amount', 'final_payment_amount', 'vehicle_count', 'guests', 'guests_adults', 'guests_children', 'nights']
const DATES = ['deposit_paid_at', 'second_paid_at', 'final_paid_at', 'second_due_date', 'final_due_date', 'cancelled_at', 'checked_in_at']

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  const { id } = await params
  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
  }

  const rejected = Object.keys(raw).filter(k => !EDITABLE.has(k))
  const cleaned: Record<string, any> = Object.fromEntries(
    Object.entries(raw).filter(([k]) => EDITABLE.has(k))
  )

  /* Say WHY the money was refused rather than dropping it silently — a form that
     appears to save a figure and doesn't is worse than one that says no. */
  const refusedMoney = rejected.filter(k => (COMPUTED as readonly string[]).includes(k))

  for (const k of NUMERIC) {
    if (cleaned[k] === '' || cleaned[k] === null) cleaned[k] = null
    else if (cleaned[k] !== undefined) cleaned[k] = parseFloat(cleaned[k])
  }
  for (const k of DATES) if (cleaned[k] === '') cleaned[k] = null

  if (cleaned.guests_adults != null || cleaned.guests_children != null) {
    cleaned.guests = (cleaned.guests_adults || 0) + (cleaned.guests_children || 0)
  }

  if (!Object.keys(cleaned).length) {
    return NextResponse.json({
      error: refusedMoney.length
        ? 'Amounts derived from the tax rules cannot be typed in directly.'
        : 'Nothing editable in that request.',
      rejected, refused_money: refusedMoney,
    }, { status: 400 })
  }

  const { error } = await supabaseUpdate(id, cleaned)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({
    ok: true,
    updated: Object.keys(cleaned),
    ...(rejected.length ? { rejected } : {}),
    ...(refusedMoney.length ? {
      refused_money: refusedMoney,
      note: 'HST, MAT and total are computed from the property\'s tax rules, not typed. Use the figures endpoint.',
    } : {}),
  })
}

async function supabaseUpdate(id: string, cleaned: Record<string, any>) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('bookings').update(cleaned).eq('id', id)
  return { error: error?.message || null }
}
