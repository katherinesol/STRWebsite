import { NextRequest, NextResponse } from 'next/server'
import { rollingAverage, stayUsage } from '@/lib/water-usage'
import { fullStayRange } from '@/lib/stay-groups'
import { getCisternLevel } from '@/lib/cistern'
import { isAuthed } from '@/lib/auth'


export async function GET(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const propertyId = sp.get('property') || 'nickel-beach'
  const checkIn = sp.get('checkIn')
  const checkOut = sp.get('checkOut')

  // per-stay mode
  if (checkIn && checkOut) {
    // if this booking is part of a linked stay, measure across the WHOLE occupancy
    const bookingId = sp.get('bookingId')
    const bookingKind = sp.get('bookingKind') || 'platform'
    let rangeIn = checkIn, rangeOut = checkOut, linked = false
    if (bookingId) {
      const full = await fullStayRange(bookingId, bookingKind).catch(() => null)
      if (full) { rangeIn = full.start; rangeOut = full.end; linked = true }
    }
    const stay = await stayUsage(propertyId, rangeIn, rangeOut)
    return NextResponse.json({ stay, linked, range: { start: rangeIn, end: rangeOut } })
  }

  // dashboard mode: rolling avg + forecast from current level
  const avg = await rollingAverage(propertyId)
  const current = await getCisternLevel(false)
  let daysUntilRefill: number | null = null
  if (avg.avgPerNight && avg.avgPerNight > 0 && current?.percent != null) {
    const usableAbove = current.percent - (current.lowThreshold || 25)
    daysUntilRefill = usableAbove > 0 ? Math.floor(usableAbove / avg.avgPerNight) : 0
  }
  return NextResponse.json({
    avgPerNight: avg.avgPerNight,
    sampleStays: avg.sampleStays,
    currentLevel: current?.percent ?? null,
    lowThreshold: current?.lowThreshold ?? 25,
    daysUntilRefill,
  })
}
