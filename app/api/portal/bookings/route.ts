import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { portalAuth } from '@/lib/guest/portal-auth'

/*  THE SAME HOLE, ONE ENDPOINT OVER. This listed a guest's stays for anybody who
 *  typed their email address. Less is behind it than the booking route — no door
 *  code — but "which properties, on which dates, under which reference" is not
 *  public either, and it was free.
 *
 *  No bookingId here, so a hub cookie has nothing to bind to; this endpoint
 *  takes the Supabase session only, and lists that verified guest's bookings
 *  rather than whoever's email was supplied. */
export async function GET(request: NextRequest) {
  const auth = await portalAuth(request)
  if (!auth.ok || auth.by !== 'supabase') return NextResponse.json({}, { status: 401 })

  const supabase = createAdminClient()

  const { data: guest } = await supabase
    .from('guests')
    .select('id')
    .eq('email', auth.email)
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
