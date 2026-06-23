import { NextRequest, NextResponse } from 'next/server'
import { rollingAverage, stayUsage } from '@/lib/water-usage'
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
    const stay = await stayUsage(propertyId, checkIn, checkOut)
    return NextResponse.json({ stay })
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
