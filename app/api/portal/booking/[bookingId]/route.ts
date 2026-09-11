import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { loadProperty } from '@/lib/properties-db'
import { addressState, showsAddress, guestAddressCopy } from '@/lib/address-visibility'

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
  //  POIs and FAQ are content, so they come from the table with the file behind
  //  them — the same source the guest hub and the public listing now read.
  const property = await loadProperty(booking.property_id)
  const pois = property?.pois || []

  // get FAQ from property data
  const faq = property?.faq || []

  /*  THE EXACT ADDRESS, AND WHY IT IS ASSEMBLED HERE RATHER THAN FILTERED LATER.
   *
   *  The address is only PUT INTO the response when the gate says it may be
   *  seen. It is never sent and hidden by the client, because that is precisely
   *  the mistake the public listing made for months: no component rendered the
   *  address, and it sat in the payload the whole time, one View Source away.
   *  A value absent from the bytes cannot be read out of them.
   *
   *  Two independent paths, per Katherine's policy:
   *    · from 24 hours before check-in it appears on its own;
   *    · before that only if she has approved this guest's request.
   *  A denial never suppresses the automatic reveal — saying "not yet" a week
   *  out is a different decision from withholding the address of a house
   *  someone is about to walk into.
   *
   *  Genuine Toronto time, not the lock worker's digits-as-local convention,
   *  which is a Schlage backend workaround and would shift every reveal by four
   *  hours. */
  const { data: addrReq } = await supabase
    .from('address_requests')
    .select('status')
    .eq('booking_id', bookingId)
    .eq('booking_kind', 'direct')
    .maybeSingle()

  const addrState = addressState({
    checkInDate: booking.check_in,
    checkInTime: booking.early_checkin_granted ? booking.early_checkin_time : property?.checkIn,
    request: addrReq as any,
  })
  const addressVisible = showsAddress(addrState)

  return NextResponse.json({
    booking: { ...booking, faq },
    guides,
    accessCode,
    pois,
    address: addressVisible ? (property?.address ?? null) : null,
    addressState: addrState,
    addressMessage: guestAddressCopy(addrState),
    canRequestAddress: addrState === 'hidden',
  })
}
