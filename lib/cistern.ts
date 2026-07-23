import { createAdminClient } from '@/lib/supabase/server'

export type CisternReading = {
  rawPercent: number | null
  percent: number | null
  fullPoint: number
  emptyPoint: number
  lowThreshold: number
  battery: string | null
  status: string | null
  reported: string | null
  title: string
}

// fetch current level from PTDevices, apply calibration, optionally store a reading
export async function getCisternLevel(store = false): Promise<CisternReading | null> {
  const token = process.env.PTDEVICES_TOKEN
  const deviceId = process.env.PTDEVICES_CISTERN_DEVICE_ID
  if (!token || !deviceId) return null

  const supabase = createAdminClient()
  const { data: cal } = await supabase.from('cistern_calibration').select('*').eq('id', 'default').maybeSingle()
  const fullPoint = Number(cal?.full_point ?? 100)
  const emptyPoint = Number(cal?.empty_point ?? 0)
  const lowThreshold = Number(cal?.low_threshold ?? 25)

  const res = await fetch(
    `https://api.ptdevices.com/token/v1/device/${deviceId}?api_token=${token}`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) return null
  const json = await res.json()
  const d = json.data
  const raw = d?.device_data?.percent_level ?? null

  let calibrated: number | null = null
  if (raw != null && fullPoint > emptyPoint) {
    calibrated = Math.round(Math.max(0, Math.min(100, ((raw - emptyPoint) / (fullPoint - emptyPoint)) * 100)))
  }

  // store a reading (used by cron + dashboard) — dedupe to avoid spamming on rapid loads
  if (store && raw != null) {
    const { data: last } = await supabase
      .from('cistern_readings')
      .select('recorded_at')
      .eq('property_id', 'nickel-beach')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    // only store if last reading is more than 1 hour old (or none exists)
    const lastTime = last?.recorded_at ? new Date(last.recorded_at).getTime() : 0
    if (Date.now() - lastTime > 60 * 60 * 1000) {
      await supabase.from('cistern_readings').insert({
        property_id: 'nickel-beach',
        raw_level: raw,
        calibrated_level: calibrated,
      })

      // a sizeable jump while an order is outstanding means it was delivered
      try {
        const { data: pending } = await supabase
          .from('water_orders')
          .select('id, ordered_at')
          .eq('property_id', 'nickel-beach')
          .eq('delivered', false)
          .order('ordered_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (pending && calibrated != null) {
          const { data: prior } = await supabase
            .from('cistern_readings')
            .select('calibrated_level, recorded_at')
            .eq('property_id', 'nickel-beach')
            .gte('recorded_at', pending.ordered_at)
            .order('recorded_at', { ascending: true })
            .limit(1)
            .maybeSingle()

          const before = prior?.calibrated_level
          if (before != null && calibrated - before >= 15) {
            await supabase
              .from('water_orders')
              .update({ delivered: true, delivered_at: new Date().toISOString(), auto_detected: true })
              .eq('id', pending.id)
          }
        }
      } catch {}
    }
  }

  return {
    rawPercent: raw,
    percent: calibrated,
    fullPoint, emptyPoint, lowThreshold,
    battery: d?.device_data?.battery_status ?? null,
    status: d?.status ?? null,
    reported: d?.reported ?? null,
    title: d?.title ?? 'Cistern',
  }
}
