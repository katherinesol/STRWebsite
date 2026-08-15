import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/auth'
import { decideAiring } from '@/lib/window-airing'

// Mimico, Toronto (Royal York)
const LAT = 43.6156, LON = -79.4977

export async function GET(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const smokeMode = request.nextUrl.searchParams.get('smoke') === '1'

  try {
    // Open-Meteo: current temp/dewpoint/gusts + hourly precip probability for the 2h lookahead
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
      + `&current=temperature_2m,dew_point_2m,wind_gusts_10m,precipitation_probability`
      + `&hourly=precipitation_probability`
      + `&timezone=America/Toronto&forecast_hours=3`
    const res = await fetch(url, { next: { revalidate: 900 } })  // 15-min cache = poll interval
    if (!res.ok) {
      const d = decideAiring({ tempC: null, dewPointC: null, windGustKmh: null, rainProb2h: null, hour: 0, month: 1, smokeMode })
      return NextResponse.json({ ...d, error: 'weather unavailable' })
    }
    const j = await res.json()
    const cur = j.current || {}

    // 2h rain lookahead: max of next ~2 hourly precip-probability values
    const probs: number[] = (j.hourly?.precipitation_probability || []).slice(0, 3)
    const rainProb2h = probs.length ? Math.max(...probs.slice(0, 2)) : (cur.precipitation_probability ?? null)

    // local hour/month from Toronto time
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' }))

    const decision = decideAiring({
      tempC: cur.temperature_2m ?? null,
      dewPointC: cur.dew_point_2m ?? null,
      windGustKmh: cur.wind_gusts_10m ?? null,
      rainProb2h,
      hour: now.getHours(),
      month: now.getMonth() + 1,
      smokeMode,
    })
    return NextResponse.json({ ...decision, smokeMode, fetchedAt: new Date().toISOString() })
  } catch (e: any) {
    const d = decideAiring({ tempC: null, dewPointC: null, windGustKmh: null, rainProb2h: null, hour: 0, month: 1, smokeMode })
    return NextResponse.json({ ...d, error: e.message })
  }
}
