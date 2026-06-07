import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getProperty } from '@/lib/properties'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // verify guest owns this booking
  const { data: guest } = await supabase
    .from('guests')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (!guest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('guest_id', guest.id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // get guides
  const { data: guides } = await supabase
    .from('property_guides')
    .select('*')
    .eq('property_id', booking.property_id)
    .order('display_order')

  // get access code if within 48hrs
  const checkIn = new Date(booking.check_in)
  const now = new Date()
  const hoursUntil = (checkIn.getTime() - now.getTime()) / 3600000
  let accessCode = null

  if (hoursUntil <= 48) {
    const { data: code } = await supabase
      .from('access_codes')
      .select('code')
      .eq('booking_id', bookingId)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle()
    accessCode = code?.code || null
  }

  // get POIs from property data
  const property = getProperty(booking.property_id)
  const pois = property?.pois || []

  // get FAQ from property data
  const faq = property?.faq || []

  return NextResponse.json({ booking: { ...booking, faq }, guides, accessCode, pois })
}
