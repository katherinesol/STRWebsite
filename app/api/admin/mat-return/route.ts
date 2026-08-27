import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { loadRefundNetting, roomAfterRefunds } from '@/lib/mat-refunds'
import { isAuthed, hasRole } from '@/lib/auth'
import { matRate, matExempt, MAT_MAX_TAXABLE_NIGHTS } from '@/lib/tax-rates'
import { resolveApplyTax } from '@/lib/booking-tax'

// MAT return for one property + quarter, computed from live bookings.
// MAT is room-only (accommodation − discount); cleaning, extras and taxes are
// never in the base. apply_tax=false supersedes everything (a reimbursement is
// not taxable at all); then the length rule applies.
const QUARTERS: Record<string, [number, number]> = { Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11] }
const DAY = 86400000
const r2 = (v: number) => Math.round(v * 100) / 100

export async function GET(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasRole('co-owner')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const property = sp.get('property') || 'nickel-beach'
  const year = Number(sp.get('year')) || new Date().getFullYear()
  const quarter = (sp.get('quarter') || 'Q3').toUpperCase()
  const [qStart, qEnd] = QUARTERS[quarter] || QUARTERS.Q3

  const from = new Date(Date.UTC(year, qStart, 1)).toISOString().split('T')[0]
  const to = new Date(Date.UTC(year, qEnd + 1, 0)).toISOString().split('T')[0]

  const supabase = createAdminClient()
  const { data: blocks } = await supabase
    .from('calendar_blocks')
    .select('id, guest_name, platform, start_date, end_date, accommodation, discount, mat, taxes_collected, apply_tax, confirmation_code')
    // no MAT is owed on a stay that did not happen
    .neq('status', 'cancelled')
    .eq('property_id', property)
    .eq('is_booking', true)
    .lte('start_date', to)
    .gte('end_date', from)
    .order('start_date')

  /*  Refunds come off the room BEFORE it is apportioned, so a refund lands in
      the months the nights were in rather than the month the money went back.
      Airbnb's share of a MAT reversal is not netted here - see lib/mat-refunds. */
  const net = await loadRefundNetting(supabase, (blocks || []).map(b => b.id))

  const n = (v: unknown) => (v == null ? 0 : Number(v) || 0)
  const nights = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY))

  const months = [qStart, qStart + 1, qStart + 2].map(m => ({
    month: new Date(Date.UTC(year, m, 1)).toLocaleDateString('en-CA', { month: 'long', timeZone: 'UTC' }),
    monthIndex: m, nights: 0, roomRevenue: 0, exemptRevenue: 0, matOwed: 0,
  }))

  const rows = (blocks || []).map(b => {
    const total = nights(b.start_date, b.end_date)
    const taxable = resolveApplyTax(b.apply_tax, 'platform', b.platform)
    const tooLong = matExempt(property, total)
    const exempt = !taxable || tooLong
    const roomBilled = r2(n(b.accommodation) - n(b.discount))
    const roomRefunded = net.roomByBooking.get(b.id) || 0
    const room = roomAfterRefunds(roomBilled, b.id, net)
    const rate = matRate(property, new Date(b.start_date + 'T00:00:00Z'))
    const perNight = total > 0 ? room / total : 0

    // apportion nights that actually fall inside the quarter
    let qNights = 0, qRoom = 0
    for (let i = 0; i < total; i++) {
      const d = new Date(Date.parse(b.start_date + 'T00:00:00Z') + i * DAY)
      if (d.getUTCFullYear() !== year) continue
      const m = d.getUTCMonth()
      if (m < qStart || m > qEnd) continue
      const rec = months.find(x => x.monthIndex === m)
      if (!rec) continue
      qNights++; qRoom += perNight
      rec.nights++
      if (exempt) rec.exemptRevenue += perNight
      else { rec.roomRevenue += perNight; rec.matOwed += perNight * rate }
    }

    const matOwed = exempt ? 0 : r2(qRoom * rate)
    const matStored = b.mat == null ? null : n(b.mat)
    return {
      id: b.id, guest: b.guest_name, platform: b.platform,
      start: b.start_date, end: b.end_date, nights: qNights,
      room: r2(qRoom), rate, exempt,
      roomBilled, roomRefunded,
      matYoursReversed: net.matYoursByBooking.get(b.id) || 0,
      exemptReason: !taxable ? 'tax not applied' : tooLong ? `over ${MAT_MAX_TAXABLE_NIGHTS} nights` : null,
      matOwed, matStored,
      shortfall: matStored == null ? null : r2(matOwed - matStored),
    }
  }).filter(r => r.nights > 0)

  for (const m of months) {
    m.roomRevenue = r2(m.roomRevenue); m.exemptRevenue = r2(m.exemptRevenue); m.matOwed = r2(m.matOwed)
  }

  const totalOwed = r2(rows.reduce((s, r) => s + r.matOwed, 0))
  const totalRoom = r2(rows.reduce((s, r) => s + (r.exempt ? 0 : r.room), 0))
  const totalNights = rows.reduce((s, r) => s + r.nights, 0)
  const withStored = rows.filter(r => r.matStored != null)
  const totalCollected = r2(withStored.reduce((s, r) => s + (r.matStored || 0), 0))
  const short = rows.filter(r => r.shortfall != null && r.shortfall > 0.005)
  const missing = rows.filter(r => r.matStored == null && !r.exempt)

  return NextResponse.json({
    property, year, quarter,
    range: { from, to },
    rate: matRate(property, new Date(from + 'T00:00:00Z')),
    months, rows,
    /*  Airbnb MAT that a refund reversed and this return does NOT subtract,
        because Airbnb remits that MAT and reversing it is theirs to do. Shown
        so the number is visible rather than silently dropped. */
    airbnb_mat_reversed_not_netted: net.airbnbMatNotNetted,
    airbnb_refund_count: net.airbnbRefundCount,
    airbnb_note: net.airbnbMatNotNetted > 0
      ? `${net.airbnbMatNotNetted.toFixed(2)} of MAT was reversed on Airbnb refunds and is NOT deducted here. `
        + `Airbnb collected and remits that MAT, so reversing it is theirs; deducting it would understate this return.`
      : null,
    totals: {
      nights: totalNights, roomRevenue: totalRoom, matOwed: totalOwed,
      collected: totalCollected, gap: r2(totalOwed - totalCollected),
      shortCount: short.length, missingCount: missing.length,
      bookingCount: rows.length,
    },
  })
}
