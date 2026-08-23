import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logCalendarActivity } from '@/lib/calendar-activity'
import { getAuth, hasRole } from '@/lib/auth'
import { reprogramBookingWindow, windowFromBooking } from '@/lib/seam'


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Was isAuthed(), so anyone with a login could PATCH any column on any booking.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const raw = await request.json()
  const supabase = createAdminClient()

  // What the calendar may change. Money and tax are deliberately absent: those
  // move through the booking editor, where the HST/MAT rules are applied. A raw
  // calendar PATCH must never be able to set accommodation, hst, mat or apply_tax.
  const EDITABLE = new Set([
    'start_date', 'end_date', 'reason', 'notes',
    'guest_name', 'guest_email', 'guest_phone', 'guests',
    'door_code',
    'early_checkin_time', 'late_checkout_time',
    'early_checkin_granted', 'late_checkout_granted',
    'block_for', 'block_for_name',
  ])
  const rejected = Object.keys(raw || {}).filter(k => !EDITABLE.has(k))
  const body: any = Object.fromEntries(Object.entries(raw || {}).filter(([k]) => EDITABLE.has(k)))
  if (!Object.keys(body).length) {
    return NextResponse.json({ error: 'Nothing editable in that request', rejected }, { status: 400 })
  }

  // `status` is not a column on calendar_blocks — selecting it made this query
  // 400 on every request, so `before` was always null and every comparison below
  // silently never fired. Date-change logging has never worked.
  const { data: before, error: beforeErr } = await supabase.from('calendar_blocks')
    .select('property_id, start_date, end_date, guest_name, early_checkin_time, late_checkout_time')
    .eq('id', id).maybeSingle()
  if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // auto-flip is_booking when guest name is added
  if (body.guest_name && body.guest_name.trim()) {
    body.is_booking = true

    // find or create guest record
    const name = body.guest_name.trim()
    const { data: existing } = await supabase
      .from('guests')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      body.guest_id = existing.id
    } else {
      const { data: newGuest } = await supabase
        .from('guests')
        .insert({ name, email: null, phone: null })
        .select('id')
        .single()
      if (newGuest) body.guest_id = newGuest.id
    }
  }

  const { error } = await supabase.from('calendar_blocks').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // log calendar changes for the change-feed
  try {
    const auth = await (await import('@/lib/auth')).getAuth()
    const actor = { actorId: auth.ok ? auth.userId : null, actorName: auth.ok ? auth.name : null }
    const pid = before?.property_id || body.property_id || ''
    const gname = body.guest_name || before?.guest_name || 'Guest'
    // there is no status column on calendar_blocks — a cancellation is a deletion,
    // handled by DELETE below and logged as booking.removed
    if ((('start_date' in body) && body.start_date !== before?.start_date) || (('end_date' in body) && body.end_date !== before?.end_date)) {
      const ns = body.start_date || before?.start_date, ne = body.end_date || before?.end_date
      await logCalendarActivity({ propertyId: pid, eventType: 'date_change', description: `${gname} — dates changed to ${ns} → ${ne}`, bookingId: id, bookingKind: 'platform', guestName: gname, ...actor })
    }
    // time request (a non-standard time was set but not granted)
    if (('early_checkin_time' in body && body.early_checkin_time) || ('late_checkout_time' in body && body.late_checkout_time)) {
      const t = body.late_checkout_time || body.early_checkin_time
      const kind = body.late_checkout_time ? 'checkout' : 'check-in'
      if (!body.time_granted) await logCalendarActivity({ propertyId: pid, eventType: 'time_request', description: `${gname} requested ${t} ${kind}`, bookingId: id, bookingKind: 'platform', guestName: gname, ...actor })
      else await logCalendarActivity({ propertyId: pid, eventType: 'time_approved', description: `${gname}'s ${t} ${kind} approved`, bookingId: id, bookingKind: 'platform', guestName: gname, ...actor })
    }
  } catch {}

  // if this edit touched dates or times, move the door-code window to match
  let lockUpdate: any = null
  const touchedTiming = ['start_date', 'end_date', 'early_checkin_time', 'late_checkout_time'].some(k => k in body)
  if (touchedTiming) {
    try {
      const { data: row } = await supabase.from('calendar_blocks')
        .select('property_id, platform, start_date, end_date, early_checkin_time, late_checkout_time, door_code')
        .eq('id', id).single()
      const code = String(row?.door_code || '').replace(/\D/g, '').slice(-4)
      if (row && code) {
        lockUpdate = await reprogramBookingWindow({
          propertyId: row.property_id,
          platform: row.platform || 'direct',
          code,
          startsAt: windowFromBooking(row.start_date, row.early_checkin_time, false),
          endsAt: windowFromBooking(row.end_date, row.late_checkout_time, true),
        })
      }
    } catch (e: any) {
      lockUpdate = { error: e?.message || 'reprogram failed' }
    }
  }

  return NextResponse.json({ ok: true, lockUpdate })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Was any authenticated user. The per-reason rules below only protected OWNER
  // blocks, so a cleaner could delete a cleaning block — or a real booking row,
  // since is_booking rows live in this table too.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  // load the block to check its type + ownership
  const { data: block } = await supabase.from('calendar_blocks').select('reason, blocked_by, property_id, start_date, end_date, guest_name, is_booking').eq('id', id).maybeSingle()
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })

  // block permissions: owner removes any; co-owner only their own; others none
  if (block.reason === 'owner') {
    if (auth.role === 'owner') {
      // full control
    } else if (auth.role === 'co-owner') {
      if (block.blocked_by && block.blocked_by !== auth.userId) {
        return NextResponse.json({ error: 'You can only remove your own blocks' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
  }

  const { error } = await supabase.from('calendar_blocks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logCalendarActivity({
    propertyId: block.property_id || '',
    eventType: block.is_booking ? 'cancelled' : 'block_removed',
    description: block.is_booking
      ? `${block.guest_name || 'Guest'} — booking removed (${block.start_date} → ${block.end_date})`
      : `Block removed (${block.start_date} → ${block.end_date})`,
    bookingId: id, bookingKind: 'platform', guestName: block.guest_name || null,
    actorId: auth.ok ? auth.userId : null, actorName: auth.ok ? auth.name : null,
  })
  return NextResponse.json({ ok: true })
}
