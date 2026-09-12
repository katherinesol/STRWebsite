/*  Finding a delivery nobody wrote down.
 *
 *  The cistern's auto-detection can only ever mark an ALREADY-OPEN order as
 *  delivered — it never creates one. So a refill that happens without an order
 *  in the system is invisible to it, and two of those have already happened:
 *  10 July (+38%) and 11 September (+41%). Neither has a record. Both were
 *  found by reading the level history, which is the only place the evidence
 *  survives.
 *
 *  THE NAIVE RULE IS WRONG, and the data says so. Comparing each reading with
 *  the one before it flags 17 August as a +44% fill. It was not one. A single
 *  reading at 01:54 came back 23% while the readings either side of it were 68%
 *  and 67% — a sensor dropout. A cistern does not empty and refill between
 *  midnight and noon, and treating that as a delivery would send Katherine to
 *  log a fill that never happened.
 *
 *  So a rise is measured against the HIGHEST of the previous three readings
 *  rather than the last one. Recovering from a dip is then not a rise at all:
 *  17 August scores −5 and disappears, while the two real fills still score +38
 *  and +30. One bad sample can hide a real fill for a day; it cannot invent one.
 *  Given the choice, a detector that occasionally misses beats one that cries
 *  wolf, because every false prompt teaches her to ignore the true ones. */

export type Refill = { date: string; from: number; to: number; rise: number }

const DAY = 86400000
const RISE = 15        // percentage points that count as a fill, not drift
const LOOKBACK = 3     // readings the baseline is taken from
const NEAR_DAYS = 3    // how close an order must sit to claim a rise

export function findRefills(
  readings: { calibrated_level: number | null; recorded_at: string }[],
): Refill[] {
  const rows = readings
    .filter(r => r.calibrated_level != null)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))

  const out: Refill[] = []
  for (let i = 1; i < rows.length; i++) {
    const base = Math.max(...rows.slice(Math.max(0, i - LOOKBACK), i).map(r => r.calibrated_level as number))
    const now = rows[i].calibrated_level as number
    if (now - base < RISE) continue
    // a fill spanning two readings is one fill, not two
    if (out.length && new Date(rows[i].recorded_at).getTime() - new Date(out[out.length - 1].date).getTime() <= DAY) continue
    out.push({ date: rows[i].recorded_at, from: base, to: now, rise: now - base })
  }
  return out
}

/** Refills with no order sitting near them — the ones worth asking about. */
export function unloggedRefills(
  readings: { calibrated_level: number | null; recorded_at: string }[],
  orders: { delivered_at: string | null; expected_date: string | null }[],
): Refill[] {
  return findRefills(readings).filter(r => {
    const t = new Date(r.date).getTime()
    return !orders.some(o => {
      const stamps = [
        o.delivered_at ? new Date(o.delivered_at).getTime() : null,
        o.expected_date ? new Date(o.expected_date + 'T12:00:00Z').getTime() : null,
      ]
      return stamps.some(x => x != null && Math.abs(t - x) <= NEAR_DAYS * DAY)
    })
  })
}
