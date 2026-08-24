import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { resolveGuest } from '@/lib/keyholder/guest-resolve'
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
    trip_purpose, trip_purpose_note,
  } = body

  // validate required fields
  if (!property_id || !check_in || !check_out || !guest_email || !guest_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    console.log('Step 1: find or create guest for', guest_email)
    console.log('STEP 1, service key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY, 'url present:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
    /* 1. attach a guest — one matching rule for every path, see
       lib/keyholder/guest-match.ts. This was eq('email'), which is
       case-sensitive in Postgres, so Kris@x.com and kris@x.com booked as two
       different people. It also set returning_guest, which is derived now. */
    const resolved = await resolveGuest(supabase, { name: guest_name, email: guest_email, phone: guest_phone })
    if (!resolved) return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 })
    const guestId = resolved.guestId
    const isReturning = !resolved.created

    // locked rates live on the guest record and are only honoured for someone
    // we have actually seen before
    const { data: existingGuest } = isReturning
      ? await supabase.from('guests')
          .select('locked_rate_enabled, locked_rate_royal_york, locked_rate_nickel_beach')
          .eq('id', guestId).maybeSingle()
      : { data: null as any }

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

    /* THE ID IS MINTED HERE, BEFORE THE CALL.
     *
     *  This used to insert and then read the id back with .select('id').single().
     *  create_booking_full takes a client-generated booking_id instead, so the id
     *  has to exist first — and it is used three more times below: the access
     *  code, the referral row, and the confirmation email. Reading it back is no
     *  longer an option, so getting this wrong would silently attach the access
     *  code to nothing. */
    const bookingId = randomUUID()

    /* One path for creating a booking. The direct insert that used to live here
     *  skipped confirmation_code entirely, so every public booking was created
     *  with none — and the guest gate matches on that column, which means those
     *  guests could not reach their own door code, house guide or concierge. The
     *  function generates one. */
    const { data: rpc, error: bookingError } = await supabase.rpc('create_booking_full', {
      payload: {
        mode: 'create', booking_id: bookingId, kind: 'direct',
        guest_id: guestId, guest: null, added_by: null,   // a guest booked this, not a staff member
        booking: {
          property_id, check_in, check_out, nights, guests,
          guests_adults, guests_children,
          status: payment_method === 'card' ? 'confirmed' : 'pending_payment',
          payment_method,
          accommodation: finalAccommodation,
          cleaning_fee, hst, mat, addon_fee, total,
          apply_tax: false,                                // direct bookings, per defaultApplyTax
          booking_reference: bookingReference,
          deposit_amount, second_payment_amount, final_payment_amount,
          second_due_date, final_due_date,
          early_checkin, early_checkin_time,
          late_checkout, late_checkout_time,
          trip_purpose: trip_purpose || null,
          trip_purpose_note: trip_purpose_note || null,
          bag_drop, instacart_requested, vehicle_count, plate_numbers, plates_pending,
        },
        expenses: [],
      },
    })
    if (bookingError || !(rpc as any)?.ok) {
      console.error('create_booking_full failed:', bookingError?.message || JSON.stringify(rpc))
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
    }
    const booking = { id: bookingId }

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
    // send confirmation email
    try {
      const { sendBookingConfirmation } = await import('@/lib/email')
      await sendBookingConfirmation(
        { ...booking, booking_reference: bookingReference, property_id, check_in, check_out, guests: (guests_adults || 0) + (guests_children || 0) || guests, guests_adults, guests_children, total, deposit_amount, payment_method, early_checkin_granted: false, late_checkout_granted: false },
        { name: guest_name, email: guest_email }
      )
    } catch (emailErr) {
      console.error('Email send failed:', emailErr)
      // don't fail the booking if email fails
    }

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
