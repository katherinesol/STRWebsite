import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { differenceInDays } from 'date-fns'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { guest_name, guest_email, guest_phone, use_existing, property_id, check_in, check_out, guests, platform, payment_method, total, deposit_amount, notes } = body

  const supabase = createAdminClient()

  // find or create guest
  let guestId = use_existing || null
  if (!guestId && guest_email) {
    const { data: existing } = await supabase.from('guests').select('id').eq('email', guest_email).maybeSingle()
    if (existing) {
      guestId = existing.id
    } else {
      const { data: newGuest } = await supabase.from('guests').insert({ name: guest_name, email: guest_email, phone: guest_phone }).select('id').single()
      guestId = newGuest?.id
    }
  }

  const nights = differenceInDays(new Date(check_out), new Date(check_in))

  // generate booking reference
  const { data: refNum } = await supabase.rpc('get_next_booking_ref')
  const bookingReference = `RS-${String(refNum || Date.now().toString().slice(-4)).padStart(4, '0')}`

  const { data: booking, error } = await supabase.from('bookings').insert({
    property_id, guest_id: guestId,
    check_in, check_out, nights, guests,
    status: 'confirmed',
    payment_method,
    total: total ? parseFloat(total) : null,
    deposit_amount: deposit_amount ? parseFloat(deposit_amount) : null,
    deposit_paid_at: deposit_amount ? new Date().toISOString() : null,
    booking_reference: bookingReference,
    accommodation: total ? parseFloat(total) : null,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, booking_id: booking?.id })
}
