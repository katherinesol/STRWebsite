import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, getAuth } from '@/lib/auth'
import { logCalendarActivity } from '@/lib/calendar-activity'
import {
  priceBooking, buildBookingColumns, buildExpenseRows,
} from '@/lib/haussy/booking-draft'

// Haussy's booking write path. Two modes on one endpoint so the confirm card and
// the commit can never disagree — both call priceBooking() over the same draft.
//
//   preview — reads only. Prices the stay, finds the guest, finds overlaps, and
//             lists every side effect. This is what the owner approves.
//   commit  — one transaction via create_booking_full(). Refused if that function
//             is absent: a booking half-written across three tables is worse than
//             no booking.
//
// All tax arithmetic lives in lib/haussy/booking-draft.ts. Nothing is computed here.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()

  const body = await request.json().catch(() => null)
  const d = body?.draft || {}
  const commit = body?.commit === true
  const ids = body?.ids || {}
  const createExpenses = body?.create_expenses === true

  const priced = priceBooking(d)
  if (priced.error) return NextResponse.json({ error: priced.error }, { status: 400 })

  const supabase = createAdminClient()

  // ---- guest: link an existing one rather than duplicating ----
  let guestMatch: any = null
  if (d.guest_email) {
    const { data } = await supabase.from('guests').select('id, name, email').ilike('email', String(d.guest_email)).maybeSingle()
    guestMatch = data
  }
  if (!guestMatch && d.guest_name) {
    const { data } = await supabase.from('guests').select('id, name, email').ilike('name', String(d.guest_name)).maybeSingle()
    guestMatch = data
  }
  let priorStays = 0
  if (guestMatch) {
    const [{ count: a }, { count: b }] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('guest_id', guestMatch.id),
      supabase.from('calendar_blocks').select('id', { count: 'exact', head: true }).eq('guest_id', guestMatch.id),
    ])
    priorStays = (a || 0) + (b || 0)
  }

  // ---- overlaps, both tables ----
  const [{ data: blockOv }, { data: directOv }] = await Promise.all([
    supabase.from('calendar_blocks').select('id, guest_name, start_date, end_date, platform')
      .eq('property_id', priced.property_id).lt('start_date', priced.check_out).gt('end_date', priced.check_in),
    supabase.from('bookings').select('id, check_in, check_out, status')
      .eq('property_id', priced.property_id).neq('status', 'cancelled')
      .lt('check_in', priced.check_out).gt('check_out', priced.check_in),
  ])
  const overlaps = [
    ...(blockOv || []).map(b => ({ source: 'platform', id: b.id, label: `${b.guest_name || b.platform || 'booking'} · ${b.start_date} → ${b.end_date}` })),
    ...(directOv || []).map(b => ({ source: 'direct', id: b.id, label: `direct booking · ${b.check_in} → ${b.check_out}` })),
  ]

  const preview = {
    ok: true,
    kind: priced.kind, property_id: priced.property_id, platform: priced.platform,
    check_in: priced.check_in, check_out: priced.check_out, nights: priced.nights,
    guests: priced.guests, guests_assumed: priced.guests_assumed,
    guest: {
      name: d.guest_name || null, email: d.guest_email || null, phone: d.guest_phone || null,
      existing: guestMatch ? { id: guestMatch.id, name: guestMatch.name, prior_stays: priorStays } : null,
    },
    money: priced.money,
    tax: priced.tax,
    overlaps,
    expenses: priced.expenses,
  }

  if (!commit) return NextResponse.json(preview)

  // ---------------- commit ----------------
  const booking_id = String(ids.booking || '')
  if (!UUID.test(booking_id)) {
    return NextResponse.json({ error: 'booking id required (client-generated for idempotency)' }, { status: 400 })
  }
  const guest_new_id = ids.guest && UUID.test(String(ids.guest)) ? String(ids.guest) : null
  const expenseIds: string[] = Array.isArray(ids.expenses) ? ids.expenses.filter((x: any) => UUID.test(String(x))) : []
  if (createExpenses && priced.expenses.length > expenseIds.length) {
    return NextResponse.json({ error: 'an id is required for each expense' }, { status: 400 })
  }

  const payload = {
    booking_id, kind: priced.kind,
    guest_id: guestMatch?.id || null,
    guest: !guestMatch && d.guest_name && guest_new_id
      ? { id: guest_new_id, name: d.guest_name, email: d.guest_email || '', phone: d.guest_phone || '' }
      : null,
    booking: buildBookingColumns(d, priced),
    expenses: createExpenses ? buildExpenseRows(priced, expenseIds) : [],
  }

  const { data: rpc, error } = await supabase.rpc('create_booking_full', { payload })
  if (error) {
    const missing = /function .*create_booking_full.* does not exist|PGRST202/i.test(error.message || '')
    return NextResponse.json({
      ok: false, applied: false,
      error: missing
        ? 'create_booking_full is not installed. Run supabase/create_booking_full.sql — nothing was written.'
        : error.message,
    }, { status: missing ? 501 : 500 })
  }

  if (!(rpc as any)?.already) {
    await logCalendarActivity({
      propertyId: priced.property_id, eventType: 'new_booking',
      description: `New booking · ${d.guest_name || 'Guest'} · ${priced.check_in} → ${priced.check_out}` + (priced.platform ? ` (${priced.platform})` : ' (direct)'),
      bookingId: booking_id, bookingKind: priced.kind, guestName: d.guest_name || null,
      actorId: auth.ok ? auth.userId : null, actorName: auth.ok ? auth.name : null,
    })
  }
  try {
    await supabase.from('haussy_log').insert({
      user_id: auth.ok ? auth.userId : null, user_role: auth.ok ? auth.role : 'owner',
      question: '[create_booking — confirmed proposal]',
      tools_called: [{ tool: 'create_booking_full', input: { kind: priced.kind, property_id: priced.property_id, dates: `${priced.check_in}..${priced.check_out}` }, ok: true }],
      answer_preview: `${(rpc as any)?.already ? 'Repeat submit ignored for' : 'Created'} booking ${booking_id} · ${d.guest_name || 'guest'} · hst ${priced.tax.hst} mat ${priced.tax.mat} apply_tax ${priced.tax.apply_tax}`,
    })
  } catch {}

  return NextResponse.json({ ...preview, applied: true, result: rpc })
}
