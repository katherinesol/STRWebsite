import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/auth'
import { decideHotTubWind } from '@/lib/hot-tub-wind'
import { PROPERTIES } from '@/lib/properties'

// Nickel Beach (Port Colborne). Coordinates come from the property's mapOffset —
// it is deliberately offset from the exact address, which is immaterial for
// weather and keeps the precise location out of another file.
const nb = PROPERTIES['nickel-beach']
const LAT = nb?.mapOffset?.lat ?? 42.8712
const LON = nb?.mapOffset?.lng ?? -79.2452

export async function GET() {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
      + `&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m`
      + `&timezone=America/Toronto`
    // same 15-min cache as window-airing so repeat dashboard loads don't hammer Open-Meteo
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) {
      const d = decideHotTubWind({ windKmh: null, gustKmh: null, directionDeg: null })
      return NextResponse.json({ ...d, error: 'weather unavailable' })
    }
    const j = await res.json()
    const cur = j.current || {}

    const decision = decideHotTubWind({
      windKmh: cur.wind_speed_10m ?? null,
      gustKmh: cur.wind_gusts_10m ?? null,
      directionDeg: cur.wind_direction_10m ?? null,
    })
    return NextResponse.json({ ...decision, fetchedAt: new Date().toISOString() })
  } catch (e: unknown) {
    const d = decideHotTubWind({ windKmh: null, gustKmh: null, directionDeg: null })
    return NextResponse.json({ ...d, error: e instanceof Error ? e.message : 'error' })
  }
}
