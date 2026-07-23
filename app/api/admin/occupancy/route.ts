import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const DAY = 86400000
const PROPS = ['royal-york-east', 'royal-york-west', 'nickel-beach']

export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()

  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const startStr = yearStart.toISOString().split('T')[0]
  const todayStr = now.toISOString().split('T')[0]
  const daysElapsed = Math.floor((now.getTime() - yearStart.getTime()) / DAY) + 1

  const [{ data: direct }, { data: blocks }] = await Promise.all([
    supabase.from('bookings')
      .select('property_id, check_in, check_out, accommodation, status')
      .neq('status', 'cancelled').lte('check_in', todayStr).gte('check_out', startStr),
    supabase.from('calendar_blocks')
      .select('property_id, start_date, end_date, accommodation, is_booking, reason, block_for')
      .lte('start_date', todayStr).gte('end_date', startStr),
  ])

  // nights of a stay that fall inside the year so far
  const nightsInWindow = (from: string, to: string) => {
    const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00')
    const lo = a < yearStart ? yearStart : a
    const capped = new Date(todayStr + 'T00:00:00')
    const hi = b > capped ? capped : b
    return Math.max(0, Math.round((hi.getTime() - lo.getTime()) / DAY))
  }

  const result = PROPS.map(pid => {
    const d = (direct || []).filter(b => b.property_id === pid)
    const cb = (blocks || []).filter(b => b.property_id === pid)
    const bookings = cb.filter(b => b.is_booking === true)
    const offMarket = cb.filter(b => b.is_booking !== true && (b.reason === 'owner' || b.block_for))

    let nights = 0, revenue = 0
    for (const b of d) { nights += nightsInWindow(b.check_in, b.check_out); revenue += Number(b.accommodation) || 0 }
    for (const b of bookings) { nights += nightsInWindow(b.start_date, b.end_date); revenue += Number(b.accommodation) || 0 }
    const blocked = offMarket.reduce((s, b) => s + nightsInWindow(b.start_date, b.end_date), 0)

    const available = Math.max(1, daysElapsed - blocked)
    return {
      property_id: pid,
      nights_booked: nights,
      days_elapsed: daysElapsed,
      days_blocked: blocked,
      days_available: available,
      occupancy: Math.round((nights / available) * 1000) / 10,
      adr: nights > 0 ? Math.round((revenue / nights) * 100) / 100 : null,
      revpar: Math.round((revenue / available) * 100) / 100,
      accommodation_revenue: Math.round(revenue * 100) / 100,
    }
  })

  return NextResponse.json({ year: now.getFullYear(), properties: result })
}
