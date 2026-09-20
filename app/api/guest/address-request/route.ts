import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sessionMatches } from '@/lib/guest/prove'

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

/*  Which table the booking lives in, for a caller whose session already proved
 *  it. No code comparison, because the cookie's signature already did the work
 *  the code would have done. */
async function bookingKind(id: string): Promise<{ kind: 'direct' | 'platform' } | null> {
  const supabase = createAdminClient()
  const { data: d } = await supabase.from('bookings').select('id').eq('id', id).maybeSingle()
  if (d) return { kind: 'direct' }
  const { data: p } = await supabase.from('calendar_blocks').select('id').eq('id', id).maybeSingle()
  return p ? { kind: 'platform' } : null
}

export async function POST(request: NextRequest) {
  const { booking_id, code } = await request.json().catch(() => ({}))

  /*  A SESSION FOR THIS BOOKING IS PROOF, and it has to be: a guest on the hub
   *  verified once and the code is deliberately not kept anywhere the page can
   *  read it, so there is no code to re-send. The cookie is bound to one booking
   *  id — a session for another stay returns false here — so it proves exactly
   *  what the code proved and nothing more.
   *
   *  The code still works, for the portal and for anyone who has just typed it. */
  const bySession = await sessionMatches(booking_id ? String(booking_id) : null)
  if (!booking_id || (!code && !bySession)) {
    return NextResponse.json({ error: 'booking_id and code required' }, { status: 400 })
  }

  const v = bySession
    ? await bookingKind(String(booking_id))
    : await verify(String(booking_id), String(code))
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
