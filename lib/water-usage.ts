import { createAdminClient } from '@/lib/supabase/server'

export type Reading = { calibrated_level: number; raw_level: number; recorded_at: string }

// sum downward deltas (usage); upward deltas are refills
export function computeUsage(readings: Reading[]) {
  if (readings.length < 2) return { used: 0, refills: 0, refillCount: 0, readingCount: readings.length }
  let used = 0, refillTotal = 0, refillCount = 0
  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1].calibrated_level
    const curr = readings[i].calibrated_level
    if (prev == null || curr == null) continue
    const delta = curr - prev
    if (delta < 0) used += Math.abs(delta)
    else if (delta > 0) { refillTotal += delta; refillCount++ }
  }
  return { used: Math.round(used), refills: Math.round(refillTotal), refillCount, readingCount: readings.length }
}

export async function stayUsage(propertyId: string, checkIn: string, checkOut: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('cistern_readings')
    .select('calibrated_level, raw_level, recorded_at')
    .eq('property_id', propertyId)
    .gte('recorded_at', checkIn)
    .lte('recorded_at', checkOut + 'T23:59:59')
    .order('recorded_at')
  const readings = (data || []) as Reading[]
  const usage = computeUsage(readings)
  const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
  return {
    ...usage,
    nights,
    perNight: usage.readingCount >= 2 ? Math.round((usage.used / nights) * 10) / 10 : null,
  }
}

// gather recent past stays from BOTH tables (direct bookings + platform calendar_blocks)
async function recentStays(propertyId: string, limit = 12) {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: direct }, { data: platform }] = await Promise.all([
    supabase.from('bookings')
      .select('check_in, check_out')
      .eq('property_id', propertyId)
      .lt('check_out', today)
      .order('check_out', { ascending: false })
      .limit(limit),
    supabase.from('calendar_blocks')
      .select('start_date, end_date')
      .eq('property_id', propertyId)
      .eq('is_booking', true)
      .lt('end_date', today)
      .order('end_date', { ascending: false })
      .limit(limit),
  ])

  const stays = [
    ...(direct || []).map(b => ({ checkIn: b.check_in, checkOut: b.check_out })),
    ...(platform || []).map(b => ({ checkIn: b.start_date, checkOut: b.end_date })),
  ].filter(s => s.checkIn && s.checkOut)

  return stays
}

// rolling average %/night across recent stays at a property
export async function rollingAverage(propertyId: string) {
  const stays = await recentStays(propertyId)
  const rates: number[] = []
  for (const s of stays) {
    const u = await stayUsage(propertyId, s.checkIn, s.checkOut)
    if (u.perNight != null && u.perNight > 0) rates.push(u.perNight)
  }
  if (!rates.length) return { avgPerNight: null, sampleStays: 0 }
  const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length
  return { avgPerNight: Math.round(avg * 10) / 10, sampleStays: rates.length }
}
