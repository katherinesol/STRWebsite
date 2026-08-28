import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { programBookingLocks } from '@/lib/seam'
import { lockActionNeeded } from '@/lib/lock-alert'
import { chooseGuestCode } from '@/lib/lock-codes'
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
    /*  programBookingLocks was already honest — it returns all_ok and
     *  failed_count — but honesty nobody reads is indistinguishable from
     *  silence. The result was stored on the booking and the route returned
     *  ok:true regardless, so a guest could be created with no code on any door
     *  and nothing anywhere said so. */
    if (lockResult && lockResult.all_ok === false) {
      await lockActionNeeded({
        intent: 'program', propertyId: property_id, code: doorCode,
        locks: (lockResult.results || []).filter((r: any) => r.managed_by === 'us' && !r.ok).map((r: any) => r.lock),
        bookingId: booking!.id, bookingKind: 'direct',
        who: `${guest_name || 'Guest'} · ${bookingReference}`,
        window: { startsAt: new Date(check_in + 'T16:00:00').toISOString(), endsAt: new Date(check_out + 'T11:00:00').toISOString() },
        error: (lockResult.results || []).find((r: any) => r.error)?.error || (lockResult.mismatch ? lockResult.mismatch.note : null),
      })
    }
  } catch (e: any) {
    lockResult = { error: e?.message || 'Lock programming failed', all_ok: false }
    await supabase.from('bookings').update({ lock_programming: lockResult }).eq('id', booking!.id)
    await lockActionNeeded({
      intent: 'program', propertyId: property_id, code: doorCode,
      bookingId: booking!.id, bookingKind: 'direct',
      who: `${guest_name || 'Guest'} · ${bookingReference}`,
      window: { startsAt: new Date(check_in + 'T16:00:00').toISOString(), endsAt: new Date(check_out + 'T11:00:00').toISOString() },
      error: e?.message || 'Lock programming failed',
    })
  }

  // the caller must be able to see this without opening the booking row
  return NextResponse.json({
    ok: true, booking_id: booking?.id, lock: lockResult,
    lock_ok: lockResult?.all_ok !== false,
    ...(lockResult?.all_ok === false ? { action_needed: `Code ${doorCode || '?'} is not on every lock — program it by hand.` } : {}),
  })
}
