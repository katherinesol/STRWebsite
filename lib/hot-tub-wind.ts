// Hot-tub wind check — Nickel Beach (Covana Oasis cover).
//
// The manufacturer limit is 30 mph / 48 km/h in the RAISED position. The old
// handbook figure of 8 km/h was far too low (that is a light breeze).
//
// These bands are deliberately conservative and flag well before 48 km/h, for
// two reasons:
//   1. the property is on the Lake Erie shore, where lakefront wind routinely
//      exceeds the surrounding area, and
//   2. Open-Meteo returns a MODELLED AREA forecast, not a reading from a sensor
//      at the hot tub.
// The physical wind screen in the sunroom is the authority for any real
// decision; this card is an early-warning glance, nothing more.
//
// Pure decision logic; the API route supplies the reading (same split as
// lib/window-airing.ts).

export const WIND_CALM_MAX_KMH = 20     // below this: fine
export const WIND_HIGH_MIN_KMH = 30     // at/above this: cover stress zone
export const COVANA_LIMIT_KMH = 48      // manufacturer max, raised position (30 mph)

export const AREA_FORECAST_CAVEAT =
  'Area forecast — actual lakefront wind may be higher. Check the sunroom wind screen.'

export type WindReading = {
  windKmh: number | null                // sustained wind at 10m
  gustKmh: number | null                // gusts at 10m
  directionDeg: number | null
}

export type WindStatus = 'CALM' | 'WATCH' | 'HIGH' | 'UNKNOWN'

export type WindDecision = {
  status: WindStatus
  label: string
  reason: string
  detail: WindReading
}

// 0-360° → compass point
export function compass(deg: number | null): string | null {
  if (deg == null) return null
  const pts = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return pts[Math.round(deg / 22.5) % 16]
}

// 0 = calm, 1 = watch, 2 = high. Applied to sustained wind AND gusts alike —
// a gust is what catches a raised cover, so it can raise the band on its own.
function band(v: number | null): number {
  if (v == null) return -1
  if (v >= WIND_HIGH_MIN_KMH) return 2
  if (v >= WIND_CALM_MAX_KMH) return 1
  return 0
}

export function decideHotTubWind(r: WindReading): WindDecision {
  const detail = r
  const { windKmh: w, gustKmh: g } = r

  if (w == null && g == null) {
    return {
      status: 'UNKNOWN',
      label: 'Unknown',
      reason: `Wind data unavailable — check the sunroom wind screen before the cover is raised.`,
      detail,
    }
  }

  const wind = w == null ? null : Math.round(w)
  const gust = g == null ? null : Math.round(g)
  const worst = Math.max(band(w), band(g))
  // did the gusts, rather than sustained wind, drive the band?
  const gustDriven = band(g) > band(w) && gust != null

  const head = wind != null ? `${wind} km/h` : `gusting ${gust}`
  const label = gustDriven ? `${head} · gusting ${gust}` : head

  if (worst === 2) {
    return {
      status: 'HIGH',
      label: `${label} · high`,
      reason: `At or above ${WIND_HIGH_MIN_KMH} km/h — approaching the cover's stress zone (manufacturer limit ${COVANA_LIMIT_KMH} km/h). Verify against the sunroom wind screen and consider lowering the cover before use.`,
      detail,
    }
  }

  if (worst === 1) {
    return {
      status: 'WATCH',
      label: `${label} · watch`,
      reason: `Between ${WIND_CALM_MAX_KMH} and ${WIND_HIGH_MIN_KMH} km/h — keep an eye on it and check the sunroom wind screen before the cover is raised.`,
      detail,
    }
  }

  return {
    status: 'CALM',
    label: `${label} · calm`,
    reason: `Under ${WIND_CALM_MAX_KMH} km/h — hot tub is fine to use.`,
    detail,
  }
}
