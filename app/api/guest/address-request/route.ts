import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/*  A booked guest asking for the exact address before the 24-hour auto-reveal.
 *
 *  PUBLIC, like /api/guest/guide — a guest arrives from a booking link with no
 *  account. But unlike the guide, this one WRITES, so it proves the booking
 *  first: the confirmation code must match the booking it names. Without that,
 *  anyone who guessed a booking id could raise requests in a stranger's name.
 *
 *  IT NEVER RETURNS THE ADDRESS. It records that someone asked. The address is
 *  only ever served by the hub, through the same gate everything else goes
 *  through, so there is no path here that leaks it early by accident.
 *
 *  Re-requesting is idempotent — the primary key is (booking_id, booking_kind),
 *  so a guest tapping twice does not queue two decisions for Katherine. A guest
 *  whose request was DENIED cannot silently reopen it either; that stays her
 *  call until the 24-hour gate makes it moot. */

async function verify(bookingId: string, code: string) {
  const supabase = createAdminClient()
  const c = code.trim().toUpperCase()

  const { data: direct } = await supabase.from('bookings')
    .select('id, booking_reference, property_id, check_in')
    .eq('id', bookingId).maybeSingle()
  if (direct) {
    return String(direct.booking_reference || '').toUpperCase() === c
      ? { kind: 'direct' as const, booking: direct } : null
  }

  const { data: block } = await supabase.from('calendar_blocks')
    .select('id, confirmation_code, door_code, property_id, start_date')
    .eq('id', bookingId).maybeSingle()
  if (block) {
    const ok = [block.confirmation_code, block.door_code]
      .some(v => v && String(v).toUpperCase() === c)
    return ok ? { kind: 'platform' as const, booking: block } : null
  }
  return null
}

export async function POST(request: NextRequest) {
  const { booking_id, code } = await request.json().catch(() => ({}))
  if (!booking_id || !code) {
    return NextResponse.json({ error: 'booking_id and code required' }, { status: 400 })
  }

  const v = await verify(String(booking_id), String(code))
  //  Deliberately the same message either way: a different one for "no such
  //  booking" would let someone probe which ids exist.
  if (!v) return NextResponse.json({ error: 'Could not verify that booking' }, { status: 403 })

  const supabase = createAdminClient()
  const { data: existing } = await supabase.from('address_requests')
    .select('status').eq('booking_id', booking_id).eq('booking_kind', v.kind).maybeSingle()

  if (existing) {
    //  Already asked. Report the state without reopening a decision.
    return NextResponse.json({ ok: true, status: existing.status, already: true })
  }

  const { error } = await supabase.from('address_requests')
    .insert({ booking_id, booking_kind: v.kind, status: 'requested' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: 'requested' })
}
