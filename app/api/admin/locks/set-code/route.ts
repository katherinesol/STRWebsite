import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { programBookingLocks } from '@/lib/seam'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { booking_id, kind, code } = await request.json()
  if (!booking_id || !code) return NextResponse.json({ error: 'booking_id and code required' }, { status: 400 })
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: 'Code must be 4 digits' }, { status: 400 })

  const supabase = createAdminClient()
  const table = kind === 'direct' ? 'bookings' : 'calendar_blocks'
  const { data: b } = await supabase.from(table).select('*').eq('id', booking_id).single()
  if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const start = kind === 'direct' ? b.check_in : b.start_date
  const end = kind === 'direct' ? b.check_out : b.end_date
  const platform = kind === 'direct' ? 'direct' : b.platform

  const result = await programBookingLocks({
    propertyId: b.property_id,
    platform,
    code,
    phone: null,
    name: `${b.guest_name || 'Guest'} · ${start}`,
    startsAt: new Date(start + 'T16:00:00').toISOString(),
    endsAt: new Date(end + 'T11:00:00').toISOString(),
  })

  await supabase.from(table).update({ [kind === 'direct' ? 'lock_code' : 'door_code']: code }).eq('id', booking_id)
  return NextResponse.json({ ok: true, result })
}
