import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logCalendarActivity } from '@/lib/calendar-activity'
import { getAuth, hasRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const auth = await getAuth()
  const body = await request.json()
  const { property_id, start_date, end_date, block_for, block_for_name, notes } = body
  // The reason sent by the caller was ignored and every block was written as
  // 'owner', so cleaning and maintenance blocks could not be created at all.
  const REASONS = ['owner', 'cleaning', 'maintenance', 'manual']
  const reason = REASONS.includes(String(body.reason)) ? String(body.reason) : 'owner'
  // check: report conflicts, write nothing.  force: the owner saw the named
  // conflict and chose to block anyway. Never a default — the panel only sends it
  // after rendering the conflict and the owner pressing the second button.
  const checkOnly = body.check === true
  const force = body.force === true

  if (!property_id || !start_date || !end_date) {
    return NextResponse.json({ error: 'property, start and end dates required' }, { status: 400 })
  }
  if (new Date(end_date) < new Date(start_date)) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Conflicts are NAMED, not counted — a bare "those dates overlap" tells you
  // nothing about what you are about to double-book.
  const [{ data: directOv }, { data: blockOv }] = await Promise.all([
    supabase.from('bookings')
      .select('id, check_in, check_out, guest_info:guests(name)')
      .eq('property_id', property_id).neq('status', 'cancelled')
      .lt('check_in', end_date).gt('check_out', start_date),
    supabase.from('calendar_blocks')
      .select('id, start_date, end_date, guest_name, platform, reason, is_booking')
      // a cancelled booking must not stand in the way of a new one
      .neq('status', 'cancelled')
      .eq('property_id', property_id)
      .lt('start_date', end_date).gt('end_date', start_date),
  ])
  const conflicts = [
    ...(directOv || []).map((b: any) => ({
      id: b.id, kind: 'booking' as const,
      label: `${(Array.isArray(b.guest_info) ? b.guest_info[0]?.name : b.guest_info?.name) || 'A direct booking'} · ${b.check_in} → ${b.check_out} (direct)`,
    })),
    ...(blockOv || []).map((b: any) => ({
      id: b.id, kind: b.is_booking ? ('booking' as const) : ('block' as const),
      label: b.is_booking
        ? `${b.guest_name || 'A booking'} · ${b.start_date} → ${b.end_date} (${b.platform || 'platform'})`
        : `${b.reason || 'block'} · ${b.start_date} → ${b.end_date}`,
    })),
  ]

  if (checkOnly) {
    return NextResponse.json({ ok: true, check: true, conflicts })
  }
  if (conflicts.length && !force) {
    return NextResponse.json({ error: 'Those dates are already taken.', conflicts }, { status: 409 })
  }

  const { error } = await supabase.from('calendar_blocks').insert({
    property_id, start_date, end_date,
    reason,
    is_booking: false,
    block_for: reason === 'owner' ? (block_for || 'myself') : null,
    block_for_name: reason === 'owner' && block_for === 'friends-family' ? (block_for_name || null) : null,
    blocked_by: auth.ok ? auth.userId : null,
    notes: notes || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logCalendarActivity({
    propertyId: property_id,
    eventType: 'block_added',
    description: `Dates blocked ${start_date} → ${end_date} · ${reason}${force && conflicts.length ? ` — OVERRIDDEN over ${conflicts.length} existing` : ''}` + (reason === 'owner' && block_for === 'friends-family' && block_for_name ? ` (${block_for_name})` : ''),
    actorId: auth.ok ? auth.userId : null, actorName: auth.ok ? auth.name : null,
  })

  return NextResponse.json({ ok: true, forced: force && conflicts.length > 0, conflicts })
}
