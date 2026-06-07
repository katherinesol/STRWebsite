import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  if (!email) return NextResponse.json({ bookings: [] })

  const supabase = createAdminClient()

  const { data: guest } = await supabase
    .from('guests')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (!guest) return NextResponse.json({ bookings: [] })

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, property_id, check_in, check_out, nights, guests, booking_reference, status')
    .eq('guest_id', guest.id)
    .in('status', ['confirmed', 'active', 'completed'])
    .order('check_in', { ascending: false })

  return NextResponse.json({ bookings: bookings || [] })
}
