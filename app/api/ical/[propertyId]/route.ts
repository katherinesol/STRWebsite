import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach':    'Nickel Beach Retreat',
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
  const { propertyId } = await params
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  // validate token
  if (!token || token !== process.env.ICAL_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  if (!PROPERTY_NAMES[propertyId]) {
    return new NextResponse('Property not found', { status: 404 })
  }

  const supabase = createAdminClient()

  // fetch confirmed direct bookings only (not platform, not cancelled)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, check_in, check_out, booking_reference, guests, guest_info:guests(name)')
    .eq('property_id', propertyId)
    .in('status', ['confirmed', 'active'])
    .order('check_in')

  // also fetch manual calendar blocks
  const { data: manualBlocks } = await supabase
    .from('calendar_blocks')
    .select('*')
    .eq('property_id', propertyId)
    .eq('reason', 'manual')
    .not('platform', 'in', '("airbnb","vrbo","houfy")')

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

  // add manual blocks
  for (const b of manualBlocks || []) {
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
    },
  })
}
