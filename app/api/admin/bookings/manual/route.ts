import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { queueForBooking } from '@/lib/lock-queue'
import { windowFromBooking } from '@/lib/lock-window'
import { preferredGuestCode } from '@/lib/lock-codes'
import { resolveGuest } from '@/lib/keyholder/guest-resolve'
import { createAdminClient } from '@/lib/supabase/server'
import { differenceInDays } from 'date-fns'
import { hasRole, hasPermission } from '@/lib/auth'
import { logCalendarActivity } from '@/lib/calendar-activity'


export async function POST(request: NextRequest) {
  /*  TWO CATEGORIES, because this endpoint does two things. It inserts a
      booking (bookings) and then calls programBookingLocks, which puts a code
      on a real door (locks). Checking only one would leave the other reachable
      by someone explicitly denied it — and the lock half is the half that
      matters, so both are required rather than either. */
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('bookings', 'edit')) return NextResponse.json({ error: 'Not allowed to create bookings' }, { status: 403 })
  if (!await hasPermission('locks', 'edit')) return NextResponse.json({ error: 'Not allowed to program door codes, which creating a booking does' }, { status: 403 })
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

  /*  QUEUE THE CODE, DO NOT PROGRAM IT. The server has no Schlage credentials
   *  and never will, so this records what should happen and the local worker
   *  makes it happen. Weeks ahead is fine: an Encode holds 100 codes and a
   *  future-dated window self-activates, which is what the bulk run proved.
   *
   *  The code is a PREFERENCE, not a decision. Only the worker can see what is
   *  already on the device, so it resolves collisions and writes back the code
   *  it actually used. Storing a preferred code on the booking now means the
   *  guest hub and the concierge have something to show immediately; the worker
   *  corrects it if it had to differ. */
  const doorCode = preferredGuestCode(guest_phone)
  const startsAt = windowFromBooking(check_in, null, false)
  const endsAt = windowFromBooking(check_out, null, true)

  const queued = await queueForBooking({
    bookingId: booking!.id,
    bookingKind: 'direct',
    propertyId: property_id,
    platform: platform || 'direct',
    action: 'program',
    code: doorCode,
    startsAt, endsAt,
    who: `${guest_name || 'Guest'} · ${bookingReference}`,
  })

  await supabase.from('bookings').update({
    lock_code: doorCode,
    lock_programming: {
      queued_at: new Date().toISOString(),
      queued: queued.queued, skipped: queued.skipped, failed: queued.failed,
      note: 'Intent recorded. The local worker programs the lock and reports back here.',
    },
  }).eq('id', booking!.id)

  // the caller must be able to see this without opening the booking row
  return NextResponse.json({
    ok: true, booking_id: booking?.id,
    lock: {
      queued: queued.queued, skipped: queued.skipped, failed: queued.failed,
      code_requested: doorCode,
    },
    lock_ok: queued.ok,
    ...(queued.ok ? {} : { action_needed: 'The lock intent could not be queued — program by hand.' }),
  })
}
