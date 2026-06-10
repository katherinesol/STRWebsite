import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  const {
    property_id, check_in, check_out, nights, guests,
    payment_method, accommodation, cleaning_fee, hst, mat,
    addon_fee, total, deposit_amount, second_payment_amount,
    final_payment_amount, second_due_date, final_due_date,
    early_checkin, early_checkin_time, late_checkout, late_checkout_time,
    bag_drop, instacart_requested, vehicle_count, plate_numbers, plates_pending,
    guest_name, guest_email, guest_phone, referral_code,
    guests_adults, guests_children,
  } = body

  // validate required fields
  if (!property_id || !check_in || !check_out || !guest_email || !guest_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    console.log('Step 1: find or create guest for', guest_email)
    console.log('STEP 1, service key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY, 'url present:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
    // 1. find or create guest
    let guestId: string
    let isReturning = false

    const { data: existingGuest, error: guestQueryError } = await supabase
      .from('guests')
      .select('id, locked_rate_enabled, locked_rate_royal_york, locked_rate_nickel_beach')
      .eq('email', guest_email)
      .maybeSingle()

    console.log('STEP 1 query done, error:', guestQueryError?.message, 'found:', !!existingGuest)
    if (guestQueryError) throw new Error('Guest query failed: ' + guestQueryError.message)

    if (existingGuest) {
      guestId = existingGuest.id
      isReturning = true
      await supabase.from('guests').update({
        returning_guest: true,
        phone: guest_phone,
      }).eq('id', guestId)
    } else {
      const { data: newGuest, error: guestError } = await supabase
        .from('guests')
        .insert({ name: guest_name, email: guest_email, phone: guest_phone })
        .select('id')
        .single()

      if (guestError || !newGuest) {
        return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 })
      }
      guestId = newGuest.id
    }

    console.log('Step 2: guestId', guestId, 'returning', isReturning)
    console.log('STEP 2 guestId:', guestId)
    // 2. apply locked rate if applicable
    let finalAccommodation = accommodation
    if (isReturning && existingGuest?.locked_rate_enabled) {
      const lockedRate = property_id === 'nickel-beach'
        ? existingGuest.locked_rate_nickel_beach
        : existingGuest.locked_rate_royal_york
      if (lockedRate) {
        finalAccommodation = lockedRate * nights
      }
    }

    console.log('Step 3: generating reference')
    console.log('STEP 3')
    // 3. generate booking reference RS-XXXX
    const { data: seqResult } = await supabase.rpc('get_next_booking_ref')
    const refNum = seqResult || Date.now().toString().slice(-4)
    const bookingReference = `RS-${String(refNum).padStart(4, '0')}`
    const accessCode = String(refNum).padStart(4, '0').slice(-4)

    console.log('Step 4: creating booking, ref', bookingReference)
    console.log('STEP 4 ref:', bookingReference)
    // 4. create booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        property_id, guest_id: guestId,
        check_in, check_out, nights, guests,
        status: payment_method === 'card' ? 'confirmed' : 'pending_payment',
        payment_method,
        accommodation: finalAccommodation,
        cleaning_fee, hst, mat, addon_fee, total,
        deposit_amount, second_payment_amount, final_payment_amount,
        second_due_date, final_due_date,
        early_checkin, early_checkin_time,
        late_checkout, late_checkout_time,
        bag_drop, instacart_requested,
        vehicle_count, plate_numbers, plates_pending, guests_adults, guests_children,
        booking_reference: bookingReference,
      })
      .select('id')
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
    }

    console.log('Step 5: creating access code', accessCode)
    console.log('STEP 5 code:', accessCode)
    // 5. create access code
    await supabase.from('access_codes').insert({
      booking_id: booking.id,
      property_id,
      code: accessCode,
      notes: 'Auto-generated from booking reference',
    })

    console.log('STEP 6')
    // 6. handle referral code
    if (referral_code) {
      const { data: referrer } = await supabase
        .from('guests')
        .select('id')
        .eq('referral_code', referral_code)
        .single()

      if (referrer) {
        const { data: settings } = await supabase
          .from('property_settings')
          .select('referral_reward_referrer, referral_reward_referred')
          .eq('property_id', property_id)
          .single()

        await supabase.from('referrals').insert({
          referrer_guest_id: referrer.id,
          referred_guest_id: guestId,
          referred_booking_id: booking.id,
          referrer_reward_amount: settings?.referral_reward_referrer || 50,
          referred_reward_amount: settings?.referral_reward_referred || 50,
          referrer_reward_status: 'pending',
          referred_reward_status: 'pending',
        })
      }
    }

    console.log('Step 7: creating auth user')
    console.log('STEP 7')
    // 7. create Supabase auth user for guest portal
    const { data: authUser } = await supabase.auth.admin.createUser({
      email: guest_email,
      email_confirm: false,
      user_metadata: { name: guest_name, guest_id: guestId },
    })

    // send magic link for portal setup (when Resend is connected)
    // TODO: send confirmation + portal setup email via Resend

    return NextResponse.json({
      ok: true,
      booking_id: booking.id,
      booking_reference: bookingReference,
      access_code: accessCode,
    })

  } catch (err: any) {
    console.error('Booking creation error:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
