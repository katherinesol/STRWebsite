// Wind reading log — Nickel Beach (Covana cover damage evidence).
// Mirrors lib/cistern.ts: a store-on-read helper with a 1-hour dedupe throttle,
// called from both the cron and the dashboard card.
//
// Plus a backfill path, because Vercel Hobby caps crons at once-per-day and a
// single daily sample is worthless as evidence. Open-Meteo serves hourly history
// (past_days up to 92), so one daily run can write the previous 24 hours and we
// still get hourly resolution.
import { createAdminClient } from '@/lib/supabase/server'
import { decideHotTubWind, type WindReading } from '@/lib/hot-tub-wind'
import { PROPERTIES } from '@/lib/properties'

const nb = PROPERTIES['nickel-beach']
export const NB_LAT = nb?.mapOffset?.lat ?? 42.8712
export const NB_LON = nb?.mapOffset?.lng ?? -79.2452

const THROTTLE_MS = 60 * 60 * 1000   // one live reading per hour, as cistern does

export async function fetchCurrentWind(): Promise<WindReading | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${NB_LAT}&longitude=${NB_LON}`
    + `&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m&timezone=America/Toronto`
  const res = await fetch(url, { next: { revalidate: 900 } })
  if (!res.ok) return null
  const cur = (await res.json()).current || {}
  return {
    windKmh: cur.wind_speed_10m ?? null,
    gustKmh: cur.wind_gusts_10m ?? null,
    directionDeg: cur.wind_direction_10m ?? null,
  }
}

// Store a live reading, throttled to one per hour. Returns true if written.
export async function logCurrentWind(propertyId = 'nickel-beach'): Promise<boolean> {
  const supabase = createAdminClient()
  const { data: last } = await supabase
    .from('wind_readings')
    .select('recorded_at')
    .eq('property_id', propertyId)
    .eq('source', 'live')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastTime = last?.recorded_at ? new Date(last.recorded_at).getTime() : 0
  if (Date.now() - lastTime < THROTTLE_MS) return false

  const r = await fetchCurrentWind()
  if (!r || r.windKmh == null) return false
  const d = decideHotTubWind(r)

  const { error } = await supabase.from('wind_readings').insert({
    property_id: propertyId,
    wind_speed: r.windKmh,
    wind_gusts: r.gustKmh,
    wind_direction: r.directionDeg,
    status: d.status,
    source: 'live',
  })
  return !error
}

// Write hourly history. Idempotent: unique(property_id, recorded_at) means
// re-running only fills genuine gaps. pastDays max is 92 (Open-Meteo limit).
export async function backfillWind(
  propertyId = 'nickel-beach',
  pastDays = 2,
): Promise<{ fetched: number; inserted: number; error?: string }> {
  const days = Math.min(Math.max(pastDays, 1), 92)
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${NB_LAT}&longitude=${NB_LON}`
    + `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m`
    + `&past_days=${days}&forecast_days=0&timeformat=unixtime&timezone=UTC`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return { fetched: 0, inserted: 0, error: `open-meteo ${res.status}` }

  const j = await res.json()
  const times: number[] = j.hourly?.time || []
  const speeds: (number | null)[] = j.hourly?.wind_speed_10m || []
  const gusts: (number | null)[] = j.hourly?.wind_gusts_10m || []
  const dirs: (number | null)[] = j.hourly?.wind_direction_10m || []

  const now = Date.now()
  const rows = times.map((t, i) => ({
    t, speed: speeds[i] ?? null, gust: gusts[i] ?? null, dir: dirs[i] ?? null,
  }))
    .filter(r => r.t * 1000 <= now && r.speed != null)   // history only, never forecast
    .map(r => {
      const d = decideHotTubWind({ windKmh: r.speed, gustKmh: r.gust, directionDeg: r.dir })
      return {
        property_id: propertyId,
        wind_speed: r.speed,
        wind_gusts: r.gust,
        wind_direction: r.dir,
        status: d.status,
        source: 'backfill',
        recorded_at: new Date(r.t * 1000).toISOString(),
      }
    })

  if (!rows.length) return { fetched: 0, inserted: 0 }

  const supabase = createAdminClient()
  // ignoreDuplicates keeps this safe to re-run and never overwrites a live row
  const { data, error } = await supabase
    .from('wind_readings')
    .upsert(rows, { onConflict: 'property_id,recorded_at', ignoreDuplicates: true })
    .select('id')

  if (error) return { fetched: rows.length, inserted: 0, error: error.message }
  return { fetched: rows.length, inserted: data?.length ?? 0 }
}
