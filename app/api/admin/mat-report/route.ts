import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const DAY = 86400000
const RATE = 0.04
const QUARTERS: Record<string, [number, number]> = { Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11] }

export async function GET(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const year = Number(sp.get('year')) || new Date().getFullYear()
  const quarter = (sp.get('quarter') || 'Q1').toUpperCase()
  const [qStart, qEnd] = QUARTERS[quarter] || QUARTERS.Q1

  const from = new Date(Date.UTC(year, qStart, 1)).toISOString().split('T')[0]
  const to = new Date(Date.UTC(year, qEnd + 1, 0)).toISOString().split('T')[0]

  const supabase = createAdminClient()
  const { data: blocks } = await supabase
    .from('calendar_blocks')
    .select('guest_name, platform, start_date, end_date, accommodation, discount, mat, taxes_collected, confirmation_code')
    .eq('property_id', 'nickel-beach')
    .eq('is_booking', true)
    .in('platform', ['airbnb', 'vrbo', 'houfy'])
    .lte('start_date', to)
    .gte('end_date', from)

  const nights = (a: string, b: string) => Math.max(0, Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / DAY))

  const months = [qStart, qStart + 1, qStart + 2].map(m => ({
    month: new Date(Date.UTC(year, m, 1)).toLocaleDateString('en-CA', { month: 'long', timeZone: 'UTC' }),
    monthIndex: m,
    nights_occupied: 0,
    room_revenue: 0,
    mat_due: 0,
    exempt_revenue: 0,
  }))

  const rows: any[] = []

  for (const b of blocks || []) {
    const total = nights(b.start_date, b.end_date)
    if (total <= 0) continue
    const exempt = total > 29
    const nightly = ((Number(b.accommodation) || 0) - (Number(b.discount) || 0)) / total

    // allocate each night to the month it falls in
    const perMonth: Record<number, number> = {}
    for (let i = 0; i < total; i++) {
      const d = new Date(new Date(b.start_date + 'T00:00:00').getTime() + i * DAY)
      if (d.getFullYear() !== year) continue
      const m = d.getMonth()
      if (m < qStart || m > qEnd) continue
      perMonth[m] = (perMonth[m] || 0) + 1
    }

    let bookingNights = 0, bookingRevenue = 0
    for (const [m, n] of Object.entries(perMonth)) {
      const rec = months.find(x => x.monthIndex === Number(m))
      if (!rec) continue
      const revenue = nightly * n
      rec.nights_occupied += n
      bookingNights += n
      bookingRevenue += revenue
      if (exempt) rec.exempt_revenue += revenue
      else { rec.room_revenue += revenue; rec.mat_due += revenue * RATE }
    }

    if (bookingNights > 0) {
      rows.push({
        guest: b.guest_name || 'Guest',
        platform: b.platform,
        confirmation_code: b.confirmation_code,
        stay: `${b.start_date} → ${b.end_date}`,
        total_nights: total,
        nights_in_quarter: bookingNights,
        room_revenue: Math.round(bookingRevenue * 100) / 100,
        mat_due: exempt ? 0 : Math.round(bookingRevenue * RATE * 100) / 100,
        mat_recorded: Number(b.mat) || 0,
        mat_collected_est: b.taxes_collected ? Math.round((Number(b.taxes_collected) * (4 / 17)) * 100) / 100 : null,
        variance: b.taxes_collected && !exempt
          ? Math.round(((Number(b.taxes_collected) * (4 / 17)) - (bookingRevenue * RATE)) * 100) / 100
          : null,
        exempt,
        missing_accommodation: !b.accommodation,
      })
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  const clean = months.map(m => ({
    month: m.month,
    nights_occupied: m.nights_occupied,
    room_revenue: r2(m.room_revenue),
    exempt_revenue: r2(m.exempt_revenue),
    mat_due: r2(m.mat_due),
  }))

  return NextResponse.json({
    year, quarter, from, to,
    months: clean,
    total_room_revenue: r2(clean.reduce((s, m) => s + m.room_revenue, 0)),
    total_mat_due: r2(clean.reduce((s, m) => s + m.mat_due, 0)),
    total_mat_recorded: r2(rows.reduce((s, x) => s + x.mat_recorded, 0)),
    bookings: rows.sort((a, b) => a.stay.localeCompare(b.stay)),
  })
}
