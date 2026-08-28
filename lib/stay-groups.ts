import { createAdminClient } from '@/lib/supabase/server'
import { queueForBooking } from '@/lib/lock-queue'
import { windowFromBooking } from '@/lib/lock-window'
import { logSystem } from '@/lib/system-log'

// load a group's members with their booking dates/codes (from bookings OR calendar_blocks)
async function loadGroupBookings(groupId: string) {
  const supabase = createAdminClient()
  const { data: members } = await supabase.from('stay_group_members').select('*').eq('group_id', groupId)
  const out: any[] = []
  for (const m of members || []) {
    if (m.booking_kind === 'direct') {
      // note: `bookings` has the early_checkin/late_checkout flags; calendar_blocks does not
      const { data: b } = await supabase.from('bookings')
        .select('id, property_id, check_in, check_out, lock_code, early_checkin, early_checkin_time, early_checkin_granted, late_checkout, late_checkout_time, late_checkout_granted')
        .eq('id', m.booking_id).maybeSingle()
      if (b) out.push({ member: m, start: b.check_in, end: b.check_out, code: b.lock_code, property_id: b.property_id, platform: 'direct', inTime: b.early_checkin_time, outTime: b.late_checkout_time, raw: b })
    } else {
      // calendar_blocks stores the code as door_code (bookings uses lock_code) — selecting
      // lock_code here made this whole query error out, so platform stay groups loaded as empty.
      const { data: b } = await supabase.from('calendar_blocks')
        .select('id, property_id, start_date, end_date, door_code, platform, early_checkin_time, early_checkin_granted, late_checkout_time, late_checkout_granted, guest_name')
        // a cancelled member drops out of the group rather than being programmed
        .neq('status', 'cancelled')
        .eq('id', m.booking_id).maybeSingle()
      if (b) out.push({ member: m, start: b.start_date, end: b.end_date, code: b.door_code, property_id: b.property_id, platform: b.platform || 'manual', inTime: b.early_checkin_time, outTime: b.late_checkout_time, raw: b })
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

  /*  QUEUE THE EXTENSION. Same reason as everywhere else: no credentials on the
   *  server. The intent covers the whole linked stay — earliest check-in to
   *  latest checkout — so the guest keeps one code across every booking in the
   *  group rather than needing a new one per segment.
   *
   *  This function previously computed a result and then returned ok:true
   *  regardless, recording "Extended code X" into system_activity — a different
   *  table from the system_log the UI reads, with both outcomes swallowed. */
  const queued = await queueForBooking({
    // NOT original.id — the group rows are { member, start, end, code, ... , raw }
    // with no id at the top level. `out` is loosely typed, so original.id
    // type-checked fine and would have queued booking_id undefined.
    bookingId: original.raw.id,
    bookingKind: 'platform',
    propertyId: original.property_id,
    platform: original.platform,
    action: 'reschedule',
    code: original.code,
    startsAt, endsAt,
    who: `linked stay ${earliestStart}→${latestEnd}`,
  })
  const extended = queued.ok

  await logSystem(
    extended ? 'lock.reschedule_queued' : 'lock.reprogram_failed',
    extended
      ? `Queued extension of code ${original.code} to cover linked stay ${earliestStart}→${latestEnd} on ${queued.queued.length} lock(s)`
      : `Could NOT queue the extension of code ${original.code} for linked stay ${earliestStart}→${latestEnd}.`,
    { code: original.code, start: earliestStart, end: latestEnd, queued: queued.queued, failed: queued.failed },
    original.property_id,
  )

  return {
    ok: extended,
    note: extended
      ? `Code ${original.code} extension queued to ${latestEnd} — the worker applies it on its next run.`
      : `Code ${original.code} extension could NOT be queued — do it by hand.`,
    range: { start: earliestStart, end: latestEnd },
  }
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


export function nightsBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`)
  if (isNaN(a) || isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

// Like fullStayRange, but also returns the boundary bookings so callers can read the
// real check-in / checkout TIMES for a linked stay: check-in comes from the segment that
// starts first, checkout from the segment that ends last. Null if the booking isn't linked.
export type StayBookingRow = Record<string, unknown>

export async function fullStayContext(bookingId: string, bookingKind: string): Promise<{
  start: string; end: string; nights: number
  firstBooking: StayBookingRow; lastBooking: StayBookingRow
  segments: { platform: string; start: string; end: string }[]
} | null> {
  const supabase = createAdminClient()
  const { data: member } = await supabase.from('stay_group_members')
    .select('group_id').eq('booking_id', bookingId).eq('booking_kind', bookingKind).maybeSingle()
  if (!member) return null
  const bookings = await loadGroupBookings(member.group_id)
  if (bookings.length < 2) return null   // a group of one is not a linked stay

  const byStart = [...bookings].filter(b => b.start).sort((a, b) => a.start.localeCompare(b.start))
  const byEnd = [...bookings].filter(b => b.end).sort((a, b) => a.end.localeCompare(b.end))
  if (!byStart.length || !byEnd.length) return null

  const first = byStart[0]
  const last = byEnd[byEnd.length - 1]
  return {
    start: first.start,
    end: last.end,
    nights: nightsBetween(first.start, last.end),
    firstBooking: first.raw,
    lastBooking: last.raw,
    segments: byStart.map(b => ({ platform: b.platform, start: b.start, end: b.end })),
  }
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
