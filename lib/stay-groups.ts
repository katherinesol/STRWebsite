import { createAdminClient } from '@/lib/supabase/server'
import { reprogramBookingWindow, windowFromBooking } from '@/lib/seam'

// load a group's members with their booking dates/codes (from bookings OR calendar_blocks)
async function loadGroupBookings(groupId: string) {
  const supabase = createAdminClient()
  const { data: members } = await supabase.from('stay_group_members').select('*').eq('group_id', groupId)
  const out: any[] = []
  for (const m of members || []) {
    if (m.booking_kind === 'direct') {
      const { data: b } = await supabase.from('bookings')
        .select('id, property_id, check_in, check_out, lock_code, early_checkin_time, late_checkout_time, guest_info')
        .eq('id', m.booking_id).maybeSingle()
      if (b) out.push({ member: m, start: b.check_in, end: b.check_out, code: b.lock_code, property_id: b.property_id, platform: 'direct', inTime: b.early_checkin_time, outTime: b.late_checkout_time })
    } else {
      const { data: b } = await supabase.from('calendar_blocks')
        .select('id, property_id, start_date, end_date, lock_code, platform, early_checkin_time, late_checkout_time, guest_name')
        .eq('id', m.booking_id).maybeSingle()
      if (b) out.push({ member: m, start: b.start_date, end: b.end_date, code: b.lock_code, property_id: b.property_id, platform: b.platform || 'manual', inTime: b.early_checkin_time, outTime: b.late_checkout_time })
    }
  }
  return out
}

// Extend the ORIGINAL booking's door code to cover the full linked stay
// (earliest check-in → latest checkout). One code spans the whole stay.
export async function extendCodeForStayGroup(groupId: string): Promise<{ ok: boolean; note: string; range?: { start: string; end: string } }> {
  const supabase = createAdminClient()
  const { data: group } = await supabase.from('stay_groups').select('*').eq('id', groupId).maybeSingle()
  if (!group) return { ok: false, note: 'group not found' }

  const bookings = await loadGroupBookings(groupId)
  if (!bookings.length) return { ok: false, note: 'no bookings in group' }

  // full range
  const starts = bookings.map(b => b.start).filter(Boolean).sort()
  const ends = bookings.map(b => b.end).filter(Boolean).sort()
  const earliestStart = starts[0]
  const latestEnd = ends[ends.length - 1]

  // the original booking (whose code the guest already has)
  const original = bookings.find(b => b.member.role === 'original') || bookings[0]
  if (!original.code) return { ok: false, note: 'original booking has no lock code to extend' }

  // build the extended window: check-in of earliest, checkout of latest
  const startsAt = windowFromBooking(earliestStart, original.inTime, false)
  const endsAt = windowFromBooking(latestEnd, original.outTime, true)

  const result = await reprogramBookingWindow({
    propertyId: original.property_id,
    code: original.code,
    startsAt,
    endsAt,
    platform: original.platform,
  })

  // log to system activity
  await supabase.from('system_activity').insert({
    kind: 'code_extended_stay_group',
    detail: `Extended code ${original.code} to cover linked stay ${earliestStart}→${latestEnd}`,
    property_id: original.property_id,
  }).then(() => {}, () => {})   // don't fail if activity table differs

  return { ok: true, note: `Code ${original.code} extended to ${latestEnd}`, range: { start: earliestStart, end: latestEnd } }
}


// Given a booking, if it's part of a linked stay, return the full occupancy range
// (earliest check-in → latest checkout across all members). Null if not linked.
export async function fullStayRange(bookingId: string, bookingKind: string): Promise<{ start: string; end: string } | null> {
  const supabase = createAdminClient()
  const { data: member } = await supabase.from('stay_group_members')
    .select('group_id').eq('booking_id', bookingId).eq('booking_kind', bookingKind).maybeSingle()
  if (!member) return null
  const bookings = await loadGroupBookings(member.group_id)
  if (!bookings.length) return null
  const starts = bookings.map(b => b.start).filter(Boolean).sort()
  const ends = bookings.map(b => b.end).filter(Boolean).sort()
  return { start: starts[0], end: ends[ends.length - 1] }
}


// If any booking in a linked stay holds a parking lane, extend that lane's dates
// to cover the full occupancy (so it isn't released at the original checkout).
export async function extendParkingForStayGroup(groupId: string): Promise<{ ok: boolean; note: string }> {
  const supabase = createAdminClient()
  const bookings = await loadGroupBookings(groupId)
  if (!bookings.length) return { ok: false, note: 'no bookings' }
  const starts = bookings.map(b => b.start).filter(Boolean).sort()
  const ends = bookings.map(b => b.end).filter(Boolean).sort()
  const fullStart = starts[0], fullEnd = ends[ends.length - 1]

  // find any parking assignment tied to a member booking
  const ids = bookings.map(b => b.member.booking_id)
  const { data: assigns } = await supabase.from('parking_assignments').select('*').in('booking_id', ids)
  if (!assigns?.length) return { ok: true, note: 'no parking to extend' }

  // extend the (first) assignment to cover the full stay; keep its lane
  const a = assigns[0]
  await supabase.from('parking_assignments').update({ start_date: fullStart, end_date: fullEnd }).eq('id', a.id)
  return { ok: true, note: `Parking lane ${a.lane} extended to ${fullEnd}` }
}
