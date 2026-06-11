import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { property_id, platform, check_in, check_out, guest_name, amount_paid } = await request.json()
  if (!property_id || !check_in || !check_out) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const supabase = createAdminClient()
  const nights = Math.round((new Date(check_out).getTime() - new Date(check_in).getTime()) / 86400000)

  if (platform === 'direct') {
    // save as a completed booking
    const { data: refNum } = await supabase.rpc('get_next_booking_ref')
    const bookingReference = `RS-${String(refNum || Date.now().toString().slice(-4)).padStart(4, '0')}`

    // find or create guest
    let guestId = null
    if (guest_name) {
      const { data: existing } = await supabase.from('guests').select('id').ilike('name', guest_name).maybeSingle()
      if (existing) {
        guestId = existing.id
      } else {
        const { data: newGuest } = await supabase.from('guests').insert({
          name: guest_name,
          email: `${guest_name.toLowerCase().replace(/\s+/g, '.')}@imported.noemail`,
        }).select('id').single()
        guestId = newGuest?.id
      }
    }

    const { error } = await supabase.from('bookings').insert({
      property_id, guest_id: guestId, check_in, check_out, nights,
      status: 'completed',
      payment_method: 'etransfer',
      total: amount_paid ? parseFloat(amount_paid) : null,
      booking_reference: bookingReference,
      accommodation: amount_paid ? parseFloat(amount_paid) : null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // save as calendar block
    const { error } = await supabase.from('calendar_blocks').insert({
      property_id, platform, check_in: check_in, check_out: check_out,
      start_date: check_in, end_date: check_out,
      guest_name: guest_name || null,
      amount_paid: amount_paid ? parseFloat(amount_paid) : null,
      reason: 'manual',
      notes: `Imported - ${platform}`,
      is_booking: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
