export type PricingConfig = {
  property_id: string
  base_rate: number
  weekend_rate: number | null
  min_stay: number
  cleaning_fee: number
}

export type Override = {
  id: string
  property_id: string
  start_date: string
  end_date: string
  rate: number | null
  min_stay: number | null
  label: string | null
}

// price for a single date (YYYY-MM-DD). override > weekend > base
export function priceForDate(dateStr: string, config: PricingConfig, overrides: Override[]): number {
  const ov = overrides.find(o => dateStr >= o.start_date && dateStr <= o.end_date && o.rate != null)
  if (ov?.rate != null) return Number(ov.rate)
  const dow = new Date(dateStr + 'T12:00:00').getDay() // 0 Sun .. 6 Sat
  const isWeekend = dow === 5 || dow === 6 // Fri or Sat night
  if (isWeekend && config.weekend_rate != null) return Number(config.weekend_rate)
  return Number(config.base_rate)
}

// min stay for a date (override wins)
export function minStayForDate(dateStr: string, config: PricingConfig, overrides: Override[]): number {
  const ov = overrides.find(o => dateStr >= o.start_date && dateStr <= o.end_date && o.min_stay != null)
  if (ov?.min_stay != null) return Number(ov.min_stay)
  return config.min_stay
}

// sum nights in [checkIn, checkOut). returns total + per-night breakdown
export function calcStay(checkIn: string, checkOut: string, config: PricingConfig, overrides: Override[]) {
  const nights: { date: string; rate: number }[] = []
  const d = new Date(checkIn + 'T12:00:00')
  const end = new Date(checkOut + 'T12:00:00')
  while (d < end) {
    const ds = d.toISOString().split('T')[0]
    nights.push({ date: ds, rate: priceForDate(ds, config, overrides) })
    d.setDate(d.getDate() + 1)
  }
  const accommodation = nights.reduce((s, n) => s + n.rate, 0)
  const avgRate = nights.length ? Math.round(accommodation / nights.length) : 0
  const requiredMinStay = checkIn ? minStayForDate(checkIn, config, overrides) : config.min_stay
  return { nights, nightCount: nights.length, accommodation, avgRate, requiredMinStay }
}
