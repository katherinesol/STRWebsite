import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { differenceInDays } from 'date-fns'
import { isAuthed } from '@/lib/auth'


export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const { data: booking, error } = await supabase.from('bookings').insert({
    property_id, guest_id: guestId,
    check_in, check_out, nights, guests,
    status: 'confirmed',
    payment_method,
    total: totalNum,
    deposit_amount: deposit_amount ? parseFloat(deposit_amount) : depositNum,
    deposit_paid_at: deposit_amount ? new Date().toISOString() : null,
    second_payment_amount: secondPayment,
    final_payment_amount: finalPayment,
    second_due_date: secondDueDateStr,
    final_due_date: finalDueDateStr,
    booking_reference: bookingReference,
    accommodation: total ? parseFloat(total) : null,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, booking_id: booking?.id })
}
