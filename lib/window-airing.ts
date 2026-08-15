// Window ventilation decision engine — Mode A (outdoor-only).
// Implements the layered decision logic from the ventilation spec.
// Royal York (Mimico, Toronto). All temps °C.

export type AiringInput = {
  tempC: number | null            // current outdoor temp
  dewPointC: number | null        // outdoor dew point (Open-Meteo gives this natively)
  windGustKmh: number | null      // gusts
  rainProb2h: number | null       // max precip probability within next 2h (%)
  hour: number                    // local hour 0-23
  month: number                   // 1-12
  smokeMode: boolean              // manual smoke-clearance override
}

export type AiringDecision = {
  state: 'FULL OPEN' | 'TILT' | 'CLOSED' | 'UNKNOWN'
  reason: string
  detail: { tempC: number | null; dewPointC: number | null; windGustKmh: number | null; rainProb2h: number | null }
  note?: string   // e.g. tilt requires two openings
  mode: 'outdoor-only'
}

const HEATING_MONTHS = [11, 12, 1, 2, 3]

export function decideAiring(i: AiringInput): AiringDecision {
  const detail = { tempC: i.tempC, dewPointC: i.dewPointC, windGustKmh: i.windGustKmh, rainProb2h: i.rainProb2h }
  const base = { mode: 'outdoor-only' as const, detail }

  // need core data
  if (i.tempC == null || i.dewPointC == null) {
    return { state: 'UNKNOWN', reason: 'Weather data unavailable — failing closed.', ...base }
  }

  // ---- Layer 0: hard locks ----
  if (i.rainProb2h != null && i.rainProb2h > 60)
    return { state: 'CLOSED', reason: `Rain likely within 2h (${i.rainProb2h}%). Tilt lets water into the wall — closed.`, ...base }
  if (i.windGustKmh != null && i.windGustKmh > 40)
    return { state: 'CLOSED', reason: `High wind gusts (${Math.round(i.windGustKmh)} km/h). Hardware protection — closed.`, ...base }
  if (i.tempC < 0)
    return { state: 'CLOSED', reason: `Freezing (${Math.round(i.tempC)}°C). Plumbing risk — closed.`, ...base }
  // AQI + heat-pump-cooling locks omitted in Mode A (no sensor); noted in spec

  // ---- Layer 1: heating season ----
  if (HEATING_MONTHS.includes(i.month))
    return { state: 'CLOSED', reason: 'Heating season — keep closed. Use timed purge only if indoor RH climbs (needs Ecobee).', ...base }

  // ---- Layer 2: night flush ----
  if ((i.hour >= 22 || i.hour < 7) && i.tempC >= 12 && i.tempC <= 20 && i.dewPointC <= 16)
    return { state: 'FULL OPEN', reason: `Night flush — ${Math.round(i.tempC)}°C, dew point ${Math.round(i.dewPointC)}°C. Best airing window of the day.`, note: 'Open at least two windows on opposite walls for cross-flow.', ...base }

  // ---- Smoke override (Layer 5, before comfort gate) ----
  // Mode A: no indoor delta, so gate on outdoor dew point being reasonable
  if (i.smokeMode && i.dewPointC <= 16)
    return { state: 'TILT', reason: `Smoke-clearance mode — continuous tilt (dew point ${Math.round(i.dewPointC)}°C). Cumulative airflow clears odour better than short bursts.`, note: 'Tilt needs two openings on opposite walls, or one tilt + an interior door open.', ...base }

  // ---- Layer 3: moisture gate (Mode A, outdoor-only) ----
  if (i.dewPointC > 18)
    return { state: 'CLOSED', reason: `Dew point ${Math.round(i.dewPointC)}°C — muggy. Opening would import moisture. Closed.`, ...base }
  const drierAir = i.dewPointC <= 15  // proceed to comfort sizing
  if (!drierAir)
    return { state: 'TILT', reason: `Dew point ${Math.round(i.dewPointC)}°C — marginal. Low-rate tilt only.`, note: 'Tilt needs two openings for any real exchange.', ...base }

  // ---- Layer 4: comfort sizing ----
  if (i.tempC >= 15 && i.tempC <= 26)
    return { state: 'FULL OPEN', reason: `Comfortable (${Math.round(i.tempC)}°C, dew point ${Math.round(i.dewPointC)}°C). Full open for max exchange.`, note: 'Open two windows on opposite walls for cross-flow.', ...base }
  if (i.tempC >= 10 && i.tempC < 15)
    return { state: 'TILT', reason: `Good air but cool (${Math.round(i.tempC)}°C). Tilt to avoid overcooling.`, ...base }
  if (i.tempC > 26 && i.tempC <= 30)
    return { state: 'TILT', reason: `Good air but warm (${Math.round(i.tempC)}°C). Tilt to limit heat gain.`, ...base }
  return { state: 'CLOSED', reason: `Outside usable range (${Math.round(i.tempC)}°C). Closed.`, ...base }
}
