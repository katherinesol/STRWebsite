import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { checkParking, hasSharedParking, LANES } from '@/lib/parking'

// GET ?property=&start=&end=&exclude=  → availability check
// GET ?overview=1&from=&to=            → all assignments in range (for the overview page)
export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner', 'cleaner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const supabase = createAdminClient()

  if (sp.get('overview')) {
    const from = sp.get('from') || new Date().toISOString().split('T')[0]
    const to = sp.get('to') || from
    const { data } = await supabase.from('parking_assignments')
      .select('*').lte('start_date', to).gte('end_date', from).order('start_date')
    return NextResponse.json({ assignments: data || [], lanes: LANES })
  }

  const property = sp.get('property') || ''
  const start = sp.get('start') || ''
  const end = sp.get('end') || ''
  if (!hasSharedParking(property)) return NextResponse.json({ shared: false, message: 'This property has no shared parking.' })
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 })
  const check = await checkParking(property, start, end, sp.get('exclude') || undefined)
  return NextResponse.json({ shared: true, ...check })
}

// POST reserve: { booking_id, booking_kind, property_id, guest_name, start_date, end_date, car_count }
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const b = await request.json()
  if (!hasSharedParking(b.property_id)) return NextResponse.json({ error: 'No shared parking for this property' }, { status: 400 })
  if (!b.booking_id || !b.start_date || !b.end_date) return NextResponse.json({ error: 'booking_id, start_date, end_date required' }, { status: 400 })

  const supabase = createAdminClient()
  const check = await checkParking(b.property_id, b.start_date, b.end_date, b.booking_id)
  if (!check.lane) {
    return NextResponse.json({ error: 'No lane free for the full stay', freeNights: check.freeNights, fullNights: check.fullNights }, { status: 409 })
  }

  // upsert: one parking assignment per booking
  const { data: existing } = await supabase.from('parking_assignments').select('id').eq('booking_id', b.booking_id).maybeSingle()
  const row = {
    booking_id: b.booking_id,
    booking_kind: b.booking_kind || 'platform',
    property_id: b.property_id,
    guest_name: b.guest_name || null,
    start_date: b.start_date,
    end_date: b.end_date,
    car_count: Math.min(2, Math.max(1, Number(b.car_count) || 1)),
    lane: check.lane,
    notes: b.notes || null,
  }
  let error
  if (existing) ({ error } = await supabase.from('parking_assignments').update(row).eq('id', existing.id))
  else ({ error } = await supabase.from('parking_assignments').insert(row))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, lane: check.lane, laneName: check.laneName })
}

// DELETE ?booking_id=  → release the lane
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const bookingId = request.nextUrl.searchParams.get('booking_id')
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  const supabase = createAdminClient()
  await supabase.from('parking_assignments').delete().eq('booking_id', bookingId)
  return NextResponse.json({ ok: true })
}
