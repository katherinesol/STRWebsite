import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// STEP 1 (check): POST with { booking, check: true } → returns overlap warnings, does NOT write.
// STEP 2 (commit): POST with { booking } → writes guest + calendar_blocks row.

// Log the platform host service fee as a deductible expense, tied to the booking.
async function logHostFeeExpense(supabase: any, booking: any, calendarBlockId: string) {
  const fee = Number(booking.commission)
  if (!fee || fee <= 0) return
  const platform = (booking.platform || 'platform').charAt(0).toUpperCase() + (booking.platform || 'platform').slice(1)
  const ref = booking.confirmation_code ? ` · ${booking.confirmation_code}` : ''
  const note = `Host service fee — ${platform} booking, ${booking.guest_name || 'guest'}${ref}`
  // avoid duplicate: skip if an expense already references this booking's fee
  const { data: existing } = await supabase.from('expenses').select('id').eq('notes', note).maybeSingle()
  if (existing) return
  await supabase.from('expenses').insert({
    property_id: booking.property_id,
    date: booking.check_in || new Date().toISOString().split('T')[0],
    vendor: platform,
    description: 'Platform host service fee',
    amount: fee,
    category: 'Management & administration fees',
    notes: note,
    ai_extracted: true,
    confirmed: false,
  })
}

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { booking, check, update_id } = await request.json()
  if (!booking?.property_id || !booking?.check_in || !booking?.check_out) {
    return NextResponse.json({ error: 'Property, check-in, and check-out are required' }, { status: 400 })
  }
  const supabase = createAdminClient()

  // overlap check on both tables
  const { data: blockOverlaps } = await supabase
    .from('calendar_blocks')
    .select('id, guest_name, start_date, end_date, platform')
    .eq('property_id', booking.property_id)
    .lt('start_date', booking.check_out)
    .gt('end_date', booking.check_in)
  const { data: directOverlaps } = await supabase
    .from('bookings')
    .select('id, check_in, check_out, status')
    .eq('property_id', booking.property_id)
    .neq('status', 'cancelled')
    .lt('check_in', booking.check_out)
    .gt('check_out', booking.check_in)

  const overlaps = [
    ...(blockOverlaps || []).map(b => ({ source: 'platform', ...b })),
    ...(directOverlaps || []).map(b => ({ source: 'direct', ...b })),
  ]

  // CHECK phase: report overlaps, write nothing
  if (check) {
    return NextResponse.json({ ok: true, overlaps })
  }

  // COMMIT phase: create/link guest, then the booking row
  let guestId: string | null = null
  if (booking.guest_name) {
    // returning-guest linking: match by email first, then name
    let existing = null
    if (booking.guest_email) {
      const { data } = await supabase.from('guests').select('id').ilike('email', booking.guest_email).maybeSingle()
      existing = data
    }
    if (!existing && booking.guest_name) {
      const { data } = await supabase.from('guests').select('id').ilike('name', booking.guest_name).maybeSingle()
      existing = data
    }
    if (existing) {
      guestId = existing.id
      await supabase.from('guests').update({ returning_guest: true }).eq('id', existing.id)
    } else {
      const { data: newGuest } = await supabase.from('guests').insert({
        name: booking.guest_name, email: booking.guest_email || null, phone: booking.guest_phone || null,
      }).select('id').single()
      guestId = newGuest?.id || null
    }
  }

  // UPDATE path: merge screenshot data into an existing block (e.g. one imported bare from iCal)
  if (update_id) {
    const upd: any = {
      is_booking: true, platform: booking.platform || 'other', guest_id: guestId,
      guest_name: booking.guest_name || null, guest_email: booking.guest_email || null, guest_phone: booking.guest_phone || null,
      nightly_rate: booking.nightly_rate ?? null, accommodation: booking.accommodation ?? null,
      cleaning_fee: booking.cleaning_fee ?? null, taxes_collected: booking.occupancy_taxes ?? booking.taxes_collected ?? null,
      guest_total: booking.guest_total ?? null, payout_amount: booking.payout_amount ?? null,
      commission: booking.commission ?? null, discount: booking.discount ?? null,
      confirmation_code: booking.confirmation_code || null,
      early_checkin_time: booking.check_in_time || null, late_checkout_time: booking.check_out_time || null,
      door_code: booking.door_code || null,
      notes: `Enriched by Haussy from screenshot${booking.confirmation_code ? ' · ' + booking.confirmation_code : ''}`,
    }
    const { error: uerr } = await supabase.from('calendar_blocks').update(upd).eq('id', update_id)
    if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 })
    await logHostFeeExpense(supabase, booking, update_id)
    try {
      await supabase.from('haussy_log').insert({
        user_id: auth.ok ? auth.userId : null, user_role: auth.ok ? auth.role : 'owner',
        question: '[update_booking from screenshot]',
        tools_called: [{ tool: 'update_booking', input: { id: update_id }, ok: true }],
        answer_preview: `Merged screenshot into booking ${update_id} for ${booking.guest_name || 'guest'}`,
      })
    } catch {}
    return NextResponse.json({ ok: true, id: update_id, guest_id: guestId, merged: true })
  }

  const { data: created, error } = await supabase.from('calendar_blocks').insert({
    property_id: booking.property_id,
    start_date: booking.check_in, end_date: booking.check_out,
    reason: 'manual', platform: booking.platform || 'other',
    is_booking: true, guest_id: guestId,
    guest_name: booking.guest_name || null, guest_email: booking.guest_email || null, guest_phone: booking.guest_phone || null,
    nightly_rate: booking.nightly_rate ?? null, accommodation: booking.accommodation ?? null,
    cleaning_fee: booking.cleaning_fee ?? null, taxes_collected: booking.occupancy_taxes ?? booking.taxes_collected ?? null,
    guest_total: booking.guest_total ?? null, payout_amount: booking.payout_amount ?? null,
    commission: booking.commission ?? null, discount: booking.discount ?? null,
    confirmation_code: booking.confirmation_code || null,
    early_checkin_time: booking.check_in_time || null,
    late_checkout_time: booking.check_out_time || null,
    door_code: booking.door_code || null,
    notes: `Added by Haussy from screenshot${booking.confirmation_code ? ' · ' + booking.confirmation_code : ''}`,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logHostFeeExpense(supabase, booking, created?.id || '')

  // audit
  try {
    await supabase.from('haussy_log').insert({
      user_id: auth.ok ? auth.userId : null, user_role: auth.ok ? auth.role : 'owner',
      question: '[create_booking from screenshot]',
      tools_called: [{ tool: 'create_booking', input: { property_id: booking.property_id, dates: `${booking.check_in}..${booking.check_out}` }, ok: true }],
      answer_preview: `Created booking ${created?.id} for ${booking.guest_name || 'guest'}`,
    })
  } catch {}

  return NextResponse.json({ ok: true, id: created?.id, guest_id: guestId })
}
