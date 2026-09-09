import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach':    'Nickel Beach Retreat',
}

// LEGACY ALIAS — unit relabel migration, 2026-08-16.
// Airbnb/VRBO/Houfy are still subscribed to the /royal-york-east feed URL, which
// before the migration served the OPERATING suite. That suite is now royal-york-west.
// We resolve the alias server-side and return 200 with the correct calendar rather
// than issuing a 3xx: a platform that did not follow the redirect would silently
// stop importing blocked dates and cause double bookings.
//
// REMOVE once all three platforms are re-registered on the -west URL, and in any
// case BEFORE Unit 1 (royal-york-east) goes live — while this alias exists, Unit 1
// cannot serve its own calendar.
const LEGACY_ALIASES: Record<string, string> = {
  'royal-york-east': 'royal-york-west',
}

function formatICalDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function escapeIcal(str: string): string {
  return str.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  const { propertyId: requestedId } = await params
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  // validate token
  if (!token || token !== process.env.ICAL_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // resolve any legacy alias before touching the database
  const propertyId = LEGACY_ALIASES[requestedId] ?? requestedId
  const aliased = propertyId !== requestedId

  if (!PROPERTY_NAMES[propertyId]) {
    return new NextResponse('Property not found', { status: 404 })
  }

  const supabase = createAdminClient()

  /*  EVERY CURRENT AND FUTURE BOOKING, WHATEVER BOOKED IT.
   *
   *  This used to publish direct bookings plus manual blocks, and explicitly
   *  excluded anything whose platform was airbnb, vrbo or houfy. A Houfy booking
   *  was therefore withheld from the feed Airbnb reads — so Houfy could take a
   *  night and Airbnb would go on selling it. That is the double-booking this
   *  feed exists to prevent, and it was open in exactly the direction nobody was
   *  watching.
   *
   *  The exclusion was guarding a real worry — do not echo a platform's own
   *  bookings back at it — but withholding from EVERY platform to avoid echoing
   *  to ONE breaks cross-platform blocking altogether. `?exclude=airbnb` handles
   *  it precisely: Airbnb's subscription omits Airbnb's own reservations and
   *  still receives Houfy's, VRBO's and the direct ones.
   *
   *  PAST STAYS ARE DROPPED. The feed carried completed stays back to July,
   *  which tell a platform nothing and made an export of four stale events look
   *  like a working feed. Only what can still be double-booked is published. */
  const today = new Date().toISOString().slice(0, 10)
  const exclude = new Set(
    (request.nextUrl.searchParams.get('exclude') || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  )

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, check_in, check_out, booking_reference, guests, guest_info:guests(name)')
    .eq('property_id', propertyId)
    .in('status', ['confirmed', 'active'])
    .gte('check_out', today)
    .order('check_in')

  /*  Platform reservations, which is what was missing. A calendar_blocks row is a
   *  real reservation when it has been enriched (is_booking) or when it arrived
   *  from a platform feed carrying its own uid — ical_uid is the honest marker of
   *  a synced reservation, the same test the automations cron uses. */
  const { data: platformRows } = await supabase
    .from('calendar_blocks')
    .select('id, start_date, end_date, guest_name, platform, is_booking, ical_uid, notes, reason')
    .eq('property_id', propertyId)
    .neq('status', 'cancelled')
    .gte('end_date', today)
    .order('start_date')

  const platformBookings = (platformRows || []).filter(
    b => (b.is_booking || b.ical_uid) && !exclude.has(String(b.platform || '').toLowerCase())
  )

  //  Owner-held dates: maintenance, personal use, turnover. Never platform rows.
  const manualBlocks = (platformRows || []).filter(
    b => !b.is_booking && !b.ical_uid && b.reason === 'manual'
  )

  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const propertyName = PROPERTY_NAMES[propertyId]

  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Direct Stays//${propertyName}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${propertyName} — Direct Bookings`,
    'X-WR-TIMEZONE:America/Toronto',
  ].join('\r\n')

  // add direct bookings
  for (const b of bookings || []) {
    const guest = Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any
    const guestName = guest?.name || 'Direct Guest'
    ical += '\r\n' + [
      'BEGIN:VEVENT',
      `UID:${b.id}@directstays`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatICalDate(b.check_in)}`,
      `DTEND;VALUE=DATE:${formatICalDate(b.check_out)}`,
      `SUMMARY:Reserved - ${escapeIcal(guestName)}`,
      `DESCRIPTION:${escapeIcal(b.booking_reference || b.id)} · ${b.guests} guests`,
      'END:VEVENT',
    ].join('\r\n')
  }

  //  platform reservations — the ones that were missing entirely
  for (const b of platformBookings) {
    const who = (b.guest_name || '').trim()
    const label = who ? `Reserved - ${who}` : 'Reserved'
    ical += '\r\n' + [
      'BEGIN:VEVENT',
      `UID:block-${b.id}@directstays`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatICalDate(b.start_date)}`,
      `DTEND;VALUE=DATE:${formatICalDate(b.end_date)}`,
      `SUMMARY:${escapeIcal(label)}`,
      `DESCRIPTION:${escapeIcal(String(b.platform || 'platform'))} booking`,
      'END:VEVENT',
    ].join('\r\n')
  }

  // owner-held dates
  for (const b of manualBlocks) {
    ical += '\r\n' + [
      'BEGIN:VEVENT',
      `UID:block-${b.id}@directstays`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatICalDate(b.start_date)}`,
      `DTEND;VALUE=DATE:${formatICalDate(b.end_date)}`,
      `SUMMARY:${escapeIcal(b.notes || 'Blocked')}`,
      'END:VEVENT',
    ].join('\r\n')
  }

  ical += '\r\nEND:VCALENDAR'

  return new NextResponse(ical, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${propertyId}.ics"`,
      'Cache-Control': 'no-cache',
      // surfaces the alias without breaking any client; lets us confirm which
      // platforms are still on the old URL by watching for this header
      ...(aliased ? { 'X-Calendar-Alias': `${requestedId} -> ${propertyId}` } : {}),
    },
  })
}
