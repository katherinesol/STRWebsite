import { NextRequest, NextResponse } from 'next/server'
import { requireArea } from '@/lib/require-area'
import { queueForBooking } from '@/lib/lock-queue'
import { windowFromBooking } from '@/lib/lock-window'
import { createAdminClient } from '@/lib/supabase/server'

/*  Set a door code for a stay.
 *
 *  IT WAS REPORTING A SUCCESS THAT NEVER HAPPENED. This route called
 *  programBookingLocks, which writes through the Seam API. The Seam key is dead
 *  — /devices/list answers 401, "No authentication methods succeeded" — and
 *  programBookingLocks catches every per-lock failure into results[] and
 *  returns all_ok:false rather than throwing. The route then IGNORED that
 *  result entirely:
 *
 *      const result = await programBookingLocks({...})     // every lock failed
 *      await supabase.from(table).update({ lock_code: code })   // written anyway
 *      return NextResponse.json({ ok: true, result })      // client reads r.error
 *
 *  So pressing Set recorded a door code on the booking, showed a green tick,
 *  and put nothing on any lock. The sweep that would normally contradict it
 *  reads through the same dead key, so nothing did. A guest arrives at a door
 *  with a code the system is confident about.
 *
 *  IT NOW GOES THROUGH THE QUEUE, which is the path that works: 19 actions
 *  drained, and every other write site — manual bookings, cancellations,
 *  calendar edits, stay groups, iCal sync — moved to it already. This route was
 *  the last caller of the Seam write path outside the cron. The server records
 *  an intent; the local pyschlage worker executes it.
 *
 *  THE CODE IS A PREFERENCE, NOT A FACT, and the response says so. Only the
 *  worker can see what is already on the device, so it resolves collisions and
 *  writes back what it actually programmed. Same contract as bookings/manual.
 *
 *  NOTHING IS WRITTEN IF NOTHING WAS QUEUED. If no intent was recorded for any
 *  lock, the booking does not get a code and the caller gets the reason. A red
 *  honest failure beats a green false success on a door. */

export async function POST(request: NextRequest) {
  /*  OWNER ONLY, AND ALSO locks:'edit'. Stricter than its neighbours on
   *  purpose; the permission check sits beside the role check rather than
   *  replacing it. */
  const no = await requireArea('locks', 'edit', ['owner'])
  if (no) return no

  const { booking_id, kind, code } = await request.json().catch(() => ({} as any))
  if (!booking_id || !code) return NextResponse.json({ error: 'booking_id and code required' }, { status: 400 })
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: 'Code must be 4 digits' }, { status: 400 })

  const supabase = createAdminClient()
  const isDirect = kind === 'direct'
  const table = isDirect ? 'bookings' : 'calendar_blocks'
  const { data: b } = await supabase.from(table).select('*').eq('id', booking_id).maybeSingle()
  if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const start = isDirect ? b.check_in : b.start_date
  const end = isDirect ? b.check_out : b.end_date
  const platform = isDirect ? 'direct' : b.platform

  const queued = await queueForBooking({
    bookingId: booking_id,
    bookingKind: isDirect ? 'direct' : 'platform',
    propertyId: b.property_id,
    platform,
    action: 'program',
    code,
    startsAt: windowFromBooking(start, isDirect ? null : b.early_checkin_time, false),
    endsAt: windowFromBooking(end, isDirect ? null : b.late_checkout_time, true),
    who: `${b.guest_name || 'Guest'} · ${start} · set by hand`,
  })

  /*  NOTHING QUEUED AND SOMETHING FAILED is the case this route used to lie
      about. No intent exists, so nothing will reach a lock; the booking keeps
      whatever code it had and the caller gets the reason. queueForBooking has
      already raised the alert. */
  if (!queued.queued.length && queued.failed.length) {
    return NextResponse.json({
      error: `Nothing was queued, so no code was set — ${queued.failed.map(f => `${f.lock}: ${f.error}`).join('; ')}`,
      queued: queued.queued, skipped: queued.skipped, failed: queued.failed,
    }, { status: 502 })
  }

  /*  NOTHING QUEUED AND NOTHING FAILED is a different thing entirely, and
      refusing it would be its own false alarm: every door belongs to Airbnb,
      which programs them itself. Writing Airbnb's published code onto the
      booking is the whole point here — the guest hub and the concierge need
      something to show — and there is no intent to record because there is no
      work for the worker. Recorded, not queued, and the response says which. */
  if (!queued.queued.length && !queued.skipped.length) {
    return NextResponse.json({
      error: 'No active locks for this property, so there is nothing to set a code on.',
    }, { status: 400 })
  }

  await supabase.from(table).update({
    [isDirect ? 'lock_code' : 'door_code']: code,
    lock_programming: {
      queued_at: new Date().toISOString(),
      queued: queued.queued, skipped: queued.skipped, failed: queued.failed,
      note: 'Intent recorded by hand from the locks page. The local worker programs the lock and reports back here.',
    },
  }).eq('id', booking_id)

  /*  `queued` or `recorded`, never `programmed`. The distinction is the whole
      fix: the UI must not say a door is done when the worker has not run. */
  const onlyAirbnb = queued.queued.length === 0
  return NextResponse.json({
    ok: true,
    state: onlyAirbnb ? 'recorded' : 'queued',
    code,
    locks_queued: queued.queued.length,
    partial: !queued.ok,
    queued: queued.queued, skipped: queued.skipped, failed: queued.failed,
    note: onlyAirbnb
      ? 'Saved against the booking. Airbnb programs these doors itself, so nothing was queued for the worker.'
      : 'Recorded as an intent. The code reaches the lock when the worker next runs.',
  })
}
