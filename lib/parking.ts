import { createAdminClient } from '@/lib/supabase/server'

export const LANES = { 1: 'Wooden fence', 2: 'Metal fence' } as const
export type LaneId = 1 | 2

// soft preferences by unit
// Unit 2 / West is the operating suite and uses the WOODEN lane.
const PREFERENCE: Record<string, LaneId | null> = {
  'royal-york-west': 1,   // Unit 2 — wooden
  'royal-york-east': 2,   // Unit 1 — metal
  // third unit: no preference (added later)
}

// only Royal York units share the driveway
export function hasSharedParking(propertyId: string): boolean {
  return propertyId.startsWith('royal-york')
}

type Assignment = { id: string; lane: number; start_date: string; end_date: string; booking_id: string }

function nightsBetween(start: string, end: string): string[] {
  // parking occupies check-in night through the night BEFORE checkout
  const out: string[] = []
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().split('T')[0])
  }
  return out
}

// which lanes are taken on each night in the range (excluding a booking we're editing)
async function laneUsageByNight(from: string, to: string, excludeBookingId?: string) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('parking_assignments')
    .select('id, lane, start_date, end_date, booking_id')
    .lte('start_date', to).gte('end_date', from)
  const usage: Record<string, Set<number>> = {}   // night -> set of taken lanes
  for (const a of (data as Assignment[]) || []) {
    if (excludeBookingId && a.booking_id === excludeBookingId) continue
    for (const night of nightsBetween(a.start_date, a.end_date)) {
      if (!usage[night]) usage[night] = new Set()
      if (a.lane) usage[night].add(a.lane)
    }
  }
  return usage
}

export type ParkingCheck = {
  fullyAvailable: boolean
  lane: LaneId | null            // the lane we'd assign for a full-stay booking
  laneName: string | null
  freeNights: string[]           // nights at least one lane is free
  fullNights: string[]           // nights both lanes taken
  requestedNights: string[]
}

// can this unit park for these dates? which lane, and which nights are free?
export async function checkParking(propertyId: string, startDate: string, endDate: string, excludeBookingId?: string): Promise<ParkingCheck> {
  const nights = nightsBetween(startDate, endDate)
  const usage = await laneUsageByNight(startDate, endDate, excludeBookingId)

  const freeNights: string[] = []
  const fullNights: string[] = []
  for (const n of nights) {
    const taken = usage[n] || new Set()
    if (taken.size >= 2) fullNights.push(n)
    else freeNights.push(n)
  }

  // pick a lane free for ALL requested nights, honoring soft preference
  const pref = PREFERENCE[propertyId] ?? null
  const laneFreeAll = (lane: LaneId) => nights.every(n => !(usage[n] || new Set()).has(lane))

  let lane: LaneId | null = null
  if (pref && laneFreeAll(pref)) lane = pref
  else {
    const other: LaneId = pref === 1 ? 2 : 1
    if (pref && laneFreeAll(other)) lane = other
    else if (!pref) { if (laneFreeAll(1)) lane = 1; else if (laneFreeAll(2)) lane = 2 }
  }

  return {
    fullyAvailable: fullNights.length === 0 && lane !== null,
    lane,
    laneName: lane ? LANES[lane] : null,
    freeNights,
    fullNights,
    requestedNights: nights,
  }
}
