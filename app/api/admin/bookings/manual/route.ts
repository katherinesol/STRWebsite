import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { programBookingLocks } from '@/lib/seam'
import { chooseGuestCode } from '@/lib/lock-codes'
import { resolveGuest } from '@/lib/keyholder/guest-resolve'
import { createAdminClient } from '@/lib/supabase/server'
import { differenceInDays } from 'date-fns'
import { isAuthed } from '@/lib/auth'
import { logCalendarActivity } from '@/lib/calendar-activity'


export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { guest_name, guest_email, guest_phone, use_existing, property_id, check_in, check_out, guests, platform, payment_method, total, deposit_amount, notes } = body

  const supabase = createAdminClient()

  // One matching rule for every path — see lib/keyholder/guest-match.ts.
  let guestId: string | null = use_existing || null
  if (!guestId) {
    const r = await resolveGuest(supabase, { name: guest_name, email: guest_email, phone: guest_phone })
    guestId = r?.guestId ?? null
  }

  const nights = differenceInDays(new Date(check_out), new Date(check_in))
  const checkInDate = new Date(check_in)
  const secondDueDate = new Date(checkInDate); secondDueDate.setDate(secondDueDate.getDate() - 60)
  const finalDueDate = new Date(checkInDate); finalDueDate.setDate(finalDueDate.getDate() - 30)
  const secondDueDateStr = secondDueDate.toISOString().split('T')[0]
  const finalDueDateStr = finalDueDate.toISOString().split('T')[0]
  const totalNum = total ? parseFloat(total) : null
  const depositNum = totalNum ? totalNum * 0.1 : null
  const remainingAfterDeposit = totalNum && depositNum ? totalNum - depositNum : null
  const secondPayment = remainingAfterDeposit ? remainingAfterDeposit * 0.5 : null
  const finalPayment = remainingAfterDeposit ? remainingAfterDeposit * 0.5 : null

  // generate booking reference
  const { data: refNum } = await supabase.rpc('get_next_booking_ref')
  const bookingReference = `RS-${String(refNum || Date.now().toString().slice(-4)).padStart(4, '0')}`

  /* Through the one path. The id is minted here because create_booking_full
   *  takes a client-generated booking_id, and it is needed below for the lock
   *  programming and the activity log. The whole payment schedule — including
   *  deposit_paid_at, which marks a deposit taken at booking time — now travels
   *  with the call; it used to be written here and would have been dropped on
   *  the floor by the function.
   *
   *  lock_code stays a follow-up write further down, and that is not an
   *  inconsistency: it depends on the Seam call returning, so it cannot be known
   *  at insert time. Fields the booking already knows go in the function; fields
   *  that depend on something external come after. */
  const bookingId = randomUUID()
  const { data: rpc, error } = await supabase.rpc('create_booking_full', {
    payload: {
      mode: 'create', booking_id: bookingId, kind: 'direct',
      guest_id: guestId, guest: null, added_by: null,
      booking: {
        property_id, check_in, check_out, nights, guests,
        status: 'confirmed',
        payment_method,
        total: totalNum,
        apply_tax: false,
        accommodation: total ? parseFloat(total) : null,
        booking_reference: bookingReference,
        deposit_amount: deposit_amount ? parseFloat(deposit_amount) : depositNum,
        deposit_paid_at: deposit_amount ? new Date().toISOString() : null,
        second_payment_amount: secondPayment,
        final_payment_amount: finalPayment,
        second_due_date: secondDueDateStr,
        final_due_date: finalDueDateStr,
      },
      expenses: [],
    },
  })
  if (error || !(rpc as any)?.ok) {
    return NextResponse.json({ error: error?.message || 'Failed to create booking' }, { status: 500 })
  }
  const booking = { id: bookingId }

  await logCalendarActivity({
    propertyId: property_id,
    eventType: 'new_booking',
    description: `New booking · ${guest_name || 'Guest'} · ${check_in} → ${check_out}` + (platform ? ` (${platform})` : ''),
    bookingId: booking?.id, bookingKind: 'direct',
    guestName: guest_name || null,
  })

  // program the door code onto every lock for this property
  let lockResult: any = null
  let doorCode: string | null = null
  try {
    doorCode = await chooseGuestCode(property_id, guest_phone)
    lockResult = await programBookingLocks({
      propertyId: property_id,
      platform: platform || 'direct',
      code: doorCode,
      phone: guest_phone,
      name: `${guest_name || 'Guest'} · ${bookingReference}`,
      startsAt: new Date(check_in + 'T16:00:00').toISOString(),
      endsAt: new Date(check_out + 'T11:00:00').toISOString(),
    })
    await supabase.from('bookings').update({
      lock_code: doorCode,
      lock_programming: lockResult,
    }).eq('id', booking!.id)
  } catch (e: any) {
    lockResult = { error: e?.message || 'Lock programming failed', all_ok: false }
    await supabase.from('bookings').update({ lock_programming: lockResult }).eq('id', booking!.id)
  }

  return NextResponse.json({ ok: true, booking_id: booking?.id, lock: lockResult })
}
