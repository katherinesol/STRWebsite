import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { matExempt, MAT_MAX_TAXABLE_NIGHTS } from '@/lib/tax-rates'

const DAY = 86400000
const QUARTERS: Record<string, [number, number]> = { Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11] }

// Toronto MAT rate by date: 8.5% June 1 2025 – July 31 2026, then 6% from Aug 1 2026.
function rateForDate(d: Date): number {
  const t = d.getTime()
  const hikeStart = Date.UTC(2025, 5, 1)   // Jun 1 2025
  const hikeEnd = Date.UTC(2026, 6, 31)    // Jul 31 2026 (inclusive)
  if (t >= hikeStart && t <= hikeEnd) return 0.085
  return 0.06
}

export async function GET(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const year = Number(sp.get('year')) || new Date().getFullYear()
  const quarter = (sp.get('quarter') || 'Q1').toUpperCase()
  const property = sp.get('property') || 'royal-york-west'   // Unit 2 (operating) by default — separate filings per unit
  // platform filter: comma list, e.g. "airbnb,vrbo" — default all three
  const platforms = (sp.get('platforms') || 'airbnb,vrbo,houfy').split(',').map(s => s.trim()).filter(Boolean)

  const [qStart, qEnd] = QUARTERS[quarter] || QUARTERS.Q1
  const from = new Date(Date.UTC(year, qStart, 1)).toISOString().split('T')[0]
  const to = new Date(Date.UTC(year, qEnd + 1, 0)).toISOString().split('T')[0]

  const supabase = createAdminClient()
  const { data: blocks } = await supabase
    .from('calendar_blocks')
    .select('id, guest_name, platform, start_date, end_date, accommodation, discount, mat, taxes_collected, confirmation_code')
    .eq('property_id', property)
    .eq('is_booking', true)
    .in('platform', platforms)
    .lte('start_date', to)
    .gte('end_date', from)

  const nights = (a: string, b: string) => Math.max(0, Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / DAY))
  const months = [qStart, qStart + 1, qStart + 2].map(m => ({
    month: new Date(Date.UTC(year, m, 1)).toLocaleDateString('en-CA', { month: 'long', timeZone: 'UTC' }),
    monthIndex: m, nights_occupied: 0, room_revenue: 0, mat_due: 0, exempt_revenue: 0,
  }))

  // linked-stay MAT exemptions: bookings marked MAT-exempt via stay linking
  const { data: sgMembers } = await supabase.from('stay_group_members')
    .select('booking_id, mat_treatment').eq('mat_treatment', 'exempt')
  const linkedMatExempt = new Set((sgMembers || []).map(m => m.booking_id))

  const rows: any[] = []
  let totalNightsInQuarter = 0

  for (const b of blocks || []) {
    const total = nights(b.start_date, b.end_date)
    if (total <= 0) continue
    const linkExempt = linkedMatExempt.has(b.id)
    // MAT applies to continuous stays of 30 days or less, so exemption starts at
    // 31 days (30 nights) — the previous 28 exempted taxable stays and
    // under-remitted. Shared with lib/tax-rates.ts so there is one threshold.
    const tooLong = matExempt(property, total)
    const exempt = tooLong || linkExempt
    const nightly = ((Number(b.accommodation) || 0) - (Number(b.discount) || 0)) / total

    let bookingNights = 0, bookingRevenue = 0, bookingMat = 0
    for (let i = 0; i < total; i++) {
      const d = new Date(new Date(b.start_date + 'T00:00:00').getTime() + i * DAY)
      if (d.getUTCFullYear() !== year) continue
      const m = d.getUTCMonth()
      if (m < qStart || m > qEnd) continue
      const rec = months.find(x => x.monthIndex === m)
      if (!rec) continue
      const revenue = nightly
      const nightRate = rateForDate(d)   // per-night rate (handles the straddle)
      rec.nights_occupied += 1
      bookingNights += 1
      bookingRevenue += revenue
      if (exempt) { rec.exempt_revenue += revenue }
      else { rec.room_revenue += revenue; rec.mat_due += revenue * nightRate; bookingMat += revenue * nightRate }
    }

    if (bookingNights > 0) {
      totalNightsInQuarter += bookingNights
      rows.push({
        guest: b.guest_name || 'Guest',
        platform: b.platform,
        confirmation_code: b.confirmation_code,
        stay: `${b.start_date} → ${b.end_date}`,
        total_nights: total,
        nights_in_quarter: bookingNights,
        room_revenue: Math.round(bookingRevenue * 100) / 100,
        mat_due: exempt ? 0 : Math.round(bookingMat * 100) / 100,
        mat_recorded: Number(b.mat) || 0,
        exempt,
        exempt_reason: tooLong ? `over ${MAT_MAX_TAXABLE_NIGHTS} nights` : (linkExempt ? 'linked stay (MAT-exempt)' : null),
        missing_accommodation: !b.accommodation,
      })
    }
  }

  rows.sort((a, b) => a.stay.localeCompare(b.stay))
  const totalMatDue = Math.round(months.reduce((s, m) => s + m.mat_due, 0) * 100) / 100
  const totalRoomRevenue = Math.round(months.reduce((s, m) => s + m.room_revenue, 0) * 100) / 100

  return NextResponse.json({
    property, year, quarter, from, to, platforms,
    total_nights_in_quarter: totalNightsInQuarter,
    total_room_revenue: totalRoomRevenue,
    total_mat_due: totalMatDue,
    months: months.map(m => ({ ...m, room_revenue: Math.round(m.room_revenue * 100) / 100, mat_due: Math.round(m.mat_due * 100) / 100, exempt_revenue: Math.round(m.exempt_revenue * 100) / 100 })),
    bookings: rows,
    note: 'Toronto MAT: room portion only (cleaning excluded, itemized separately). 8.5% through Jul 31 2026, 6% from Aug 1 2026. Stays 28+ days exempt. File even at zero.',
  })
}
