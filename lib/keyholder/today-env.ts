/** Server-side readings for Today's Properties strip.
 *
 *  The three environment cards on the legacy dashboard are client components
 *  that each fetch after hydration, so the page paints three empty boxes and
 *  then pops. These call the same libraries directly during the server render,
 *  so the numbers arrive with the HTML. Every call is wrapped: a dead weather
 *  API must degrade to a dash, never take the morning screen down with it. */
import { getCisternLevel } from '@/lib/cistern'
import { decideAiring } from '@/lib/window-airing'
import { decideHotTubWind } from '@/lib/hot-tub-wind'
import { PROPERTIES } from '@/lib/properties'

const nb = PROPERTIES['nickel-beach']
const NB = { lat: nb?.mapOffset?.lat ?? 42.8712, lon: nb?.mapOffset?.lng ?? -79.2452 }
const RY = { lat: 43.6156, lon: -79.4977 }

async function j(url: string, seconds: number) {
  const r = await fetch(url, { next: { revalidate: seconds } })
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

export async function readEnvironment() {
  const [cistern, airing, tub] = await Promise.all([
    getCisternLevel(false).catch(() => null),

    (async () => {
      const d = await j(`https://api.open-meteo.com/v1/forecast?latitude=${RY.lat}&longitude=${RY.lon}`
        + `&current=temperature_2m,dew_point_2m,wind_gusts_10m,precipitation_probability`
        + `&hourly=precipitation_probability&timezone=America/Toronto&forecast_hours=3`, 900)
      const c = d.current || {}
      const now = new Date()
      return decideAiring({
        tempC: c.temperature_2m ?? null, dewPointC: c.dew_point_2m ?? null,
        windGustKmh: c.wind_gusts_10m ?? null,
        rainProb2h: Math.max(...(d.hourly?.precipitation_probability || [0]).slice(0, 3)),
        hour: Number(now.toLocaleString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', hour12: false })),
        month: now.getMonth() + 1, smokeMode: false,
      })
    })().catch(() => null),

    (async () => {
      const d = await j(`https://api.open-meteo.com/v1/forecast?latitude=${NB.lat}&longitude=${NB.lon}`
        + `&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m&timezone=America/Toronto`, 900)
      const c = d.current || {}
      return decideHotTubWind({
        windKmh: c.wind_speed_10m ?? null,
        gustKmh: c.wind_gusts_10m ?? null,
        directionDeg: c.wind_direction_10m ?? null,
      })
    })().catch(() => null),
  ])
  return { cistern, airing, tub }
}
