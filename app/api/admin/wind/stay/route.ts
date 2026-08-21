import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fullStayRange } from '@/lib/stay-groups'
import { isAuthed } from '@/lib/auth'

// Wind readings across a stay — evidence for Covana cover damage claims.
// Mirrors /api/admin/cistern/usage, including its linked-stay handling.
export async function GET(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const propertyId = sp.get('property') || 'nickel-beach'
  const checkIn = sp.get('checkIn')
  const checkOut = sp.get('checkOut')
  if (!checkIn || !checkOut) {
    return NextResponse.json({ error: 'checkIn and checkOut required' }, { status: 400 })
  }

  // if this booking is part of a linked stay, cover the WHOLE occupancy
  const bookingId = sp.get('bookingId')
  const bookingKind = sp.get('bookingKind') || 'platform'
  let rangeIn = checkIn, rangeOut = checkOut, linked = false
  if (bookingId) {
    const full = await fullStayRange(bookingId, bookingKind).catch(() => null)
    if (full) { rangeIn = full.start; rangeOut = full.end; linked = true }
  }

  // inclusive of the whole checkout day
  const from = `${rangeIn}T00:00:00Z`
  const to = `${rangeOut}T23:59:59Z`

  const supabase = createAdminClient()
  const { data: readings, error } = await supabase
    .from('wind_readings')
    .select('wind_speed, wind_gusts, wind_direction, status, source, recorded_at')
    .eq('property_id', propertyId)
    .gte('recorded_at', from)
    .lte('recorded_at', to)
    .order('recorded_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = readings || []
  const nums = (k: 'wind_speed' | 'wind_gusts') =>
    rows.map(r => r[k]).filter((v): v is number => v != null)
  const speeds = nums('wind_speed'), gusts = nums('wind_gusts')

  const peak = rows.reduce((best, r) =>
    (r.wind_gusts ?? -1) > (best?.wind_gusts ?? -1) ? r : best, rows[0] || null)

  return NextResponse.json({
    linked,
    range: { start: rangeIn, end: rangeOut },
    readingCount: rows.length,
    summary: {
      maxGust: gusts.length ? Math.max(...gusts) : null,
      maxSustained: speeds.length ? Math.max(...speeds) : null,
      avgSustained: speeds.length ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10 : null,
      hoursWatch: rows.filter(r => r.status === 'WATCH').length,
      hoursHigh: rows.filter(r => r.status === 'HIGH').length,
      peakAt: peak?.recorded_at ?? null,
    },
    readings: rows,
  })
}
