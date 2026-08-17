import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed, hasRole, hasPermission } from '@/lib/auth'

// Logs a gift as a real expense in the existing expense system.
// Category is deliberately the CRA-aligned 'Supplies (cleaning, guest)' — the
// fact that it was a gift is recorded in the description, so tax reporting stays clean.
const GIFT_CATEGORY = 'Supplies (cleaning, guest)'
const KINDS = ['direct', 'platform']

export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasRole('co-owner')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // creating a financial record additionally requires money-edit
  if (!await hasPermission('money', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to record expenses' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const booking_id = String(body?.booking_id || '')
  const booking_kind = String(body?.booking_kind || '')
  const amount = Number(body?.amount)
  const date = String(body?.date || '').slice(0, 10)
  const vendor = String(body?.vendor || '').trim().slice(0, 200)
  const receipt_path = body?.receipt_path ? String(body.receipt_path) : null
  const hst_paid = body?.hst_paid != null && body.hst_paid !== '' ? Number(body.hst_paid) : null

  if (!booking_id || !KINDS.includes(booking_kind)) {
    return NextResponse.json({ error: 'booking_id and booking_kind required' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'A positive amount is required' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // the gift row must already exist (the note is saved first)
  const { data: gift } = await supabase
    .from('booking_gifts')
    .select('id, note, expense_id')
    .eq('booking_id', booking_id)
    .eq('booking_kind', booking_kind)
    .maybeSingle()

  if (!gift) return NextResponse.json({ error: 'Save the gift note first' }, { status: 400 })

  // IDEMPOTENT: already logged, hand back what exists rather than double-charging
  if (gift.expense_id) {
    const { data: existing } = await supabase
      .from('expenses').select('*').eq('id', gift.expense_id).maybeSingle()
    return NextResponse.json({ ok: true, already: true, expense: existing })
  }

  // resolve the booking's property so the expense lands on the right unit
  const table = booking_kind === 'direct' ? 'bookings' : 'calendar_blocks'
  const { data: booking } = await supabase
    .from(table).select('property_id').eq('id', booking_id).maybeSingle()
  if (!booking?.property_id) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const description = gift.note ? `Guest gift — ${gift.note}` : 'Guest gift'

  const { data: expense, error: expErr } = await supabase.from('expenses').insert({
    property_id: booking.property_id,
    date,
    vendor: vendor || 'Guest gift',
    description,
    amount,
    category: GIFT_CATEGORY,
    hst_paid,
    receipt_path,
    confirmed: true,
  }).select().single()

  if (expErr || !expense) {
    return NextResponse.json({ error: expErr?.message || 'Failed to create expense' }, { status: 500 })
  }

  // Compare-and-swap: only claim the link if nobody else did while we were inserting.
  // Guards against a double-click racing past the expense_id check above.
  const { data: claimed } = await supabase
    .from('booking_gifts')
    .update({ expense_id: expense.id, updated_at: new Date().toISOString() })
    .eq('id', gift.id)
    .is('expense_id', null)
    .select('id')

  if (!claimed || claimed.length === 0) {
    // someone beat us to it — roll back our duplicate and return theirs
    await supabase.from('expenses').delete().eq('id', expense.id)
    const { data: winner } = await supabase
      .from('booking_gifts').select('expense_id').eq('id', gift.id).maybeSingle()
    const { data: existing } = await supabase
      .from('expenses').select('*').eq('id', winner?.expense_id).maybeSingle()
    return NextResponse.json({ ok: true, already: true, expense: existing })
  }

  return NextResponse.json({ ok: true, expense })
}
