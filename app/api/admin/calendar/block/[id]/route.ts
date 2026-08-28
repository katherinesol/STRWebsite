import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { splitName } from '@/lib/keyholder/guest-match'
import { logCalendarActivity } from '@/lib/calendar-activity'
import { getAuth, hasRole, hasPermission, canAddBlocks, canDeleteOwnBlocks } from '@/lib/auth'
import { reprogramBookingWindow, windowFromBooking } from '@/lib/seam'
import { lockActionNeeded } from '@/lib/lock-alert'


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Was isAuthed(), so anyone with a login could PATCH any column on any booking.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const raw = await request.json()
  const supabase = createAdminClient()

  // What the calendar may change. Money and tax are deliberately absent: those
  // move through the booking editor, where the HST/MAT rules are applied. A raw
  // calendar PATCH must never be able to set accommodation, hst, mat or apply_tax.
  const EDITABLE = new Set([
    'start_date', 'end_date', 'reason', 'notes',
    'guest_name', 'guest_email', 'guest_phone', 'guests',
    'door_code',
    'early_checkin_time', 'late_checkout_time',
    'early_checkin_granted', 'late_checkout_granted',
    'block_for', 'block_for_name',
  ])
  const rejected = Object.keys(raw || {}).filter(k => !EDITABLE.has(k))
  const body: any = Object.fromEntries(Object.entries(raw || {}).filter(([k]) => EDITABLE.has(k)))
  if (!Object.keys(body).length) {
    return NextResponse.json({ error: 'Nothing editable in that request', rejected }, { status: 400 })
  }

  // `status` is not a column on calendar_blocks — selecting it made this query
  // 400 on every request, so `before` was always null and every comparison below
  // silently never fired. Date-change logging has never worked.
  const { data: before, error: beforeErr } = await supabase.from('calendar_blocks')
    .select('property_id, start_date, end_date, guest_name, early_checkin_time, late_checkout_time')
    .eq('id', id).maybeSingle()
  if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // auto-flip is_booking when guest name is added
  if (body.guest_name && body.guest_name.trim()) {
    body.is_booking = true

    // find or create guest record
    const name = body.guest_name.trim()
    const { data: existing } = await supabase
      .from('guests')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      body.guest_id = existing.id
    } else {
      const { data: newGuest } = await supabase
        .from('guests')
        .insert({ name, ...splitName(name), email: null, phone: null })
        .select('id')
        .single()
      if (newGuest) body.guest_id = newGuest.id
    }
  }

  const { error } = await supabase.from('calendar_blocks').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // log calendar changes for the change-feed
  try {
    const auth = await (await import('@/lib/auth')).getAuth()
    const actor = { actorId: auth.ok ? auth.userId : null, actorName: auth.ok ? auth.name : null }
    const pid = before?.property_id || body.property_id || ''
    const gname = body.guest_name || before?.guest_name || 'Guest'
    // there is no status column on calendar_blocks — a cancellation is a deletion,
    // handled by DELETE below and logged as booking.removed
    if ((('start_date' in body) && body.start_date !== before?.start_date) || (('end_date' in body) && body.end_date !== before?.end_date)) {
      const ns = body.start_date || before?.start_date, ne = body.end_date || before?.end_date
      await logCalendarActivity({ propertyId: pid, eventType: 'date_change', description: `${gname} — dates changed to ${ns} → ${ne}`, bookingId: id, bookingKind: 'platform', guestName: gname, ...actor })
    }
    // time request (a non-standard time was set but not granted)
    if (('early_checkin_time' in body && body.early_checkin_time) || ('late_checkout_time' in body && body.late_checkout_time)) {
      const t = body.late_checkout_time || body.early_checkin_time
      const kind = body.late_checkout_time ? 'checkout' : 'check-in'
      if (!body.time_granted) await logCalendarActivity({ propertyId: pid, eventType: 'time_request', description: `${gname} requested ${t} ${kind}`, bookingId: id, bookingKind: 'platform', guestName: gname, ...actor })
      else await logCalendarActivity({ propertyId: pid, eventType: 'time_approved', description: `${gname}'s ${t} ${kind} approved`, bookingId: id, bookingKind: 'platform', guestName: gname, ...actor })
    }
  } catch {}

  // if this edit touched dates or times, move the door-code window to match
  let lockUpdate: any = null
  const touchedTiming = ['start_date', 'end_date', 'early_checkin_time', 'late_checkout_time'].some(k => k in body)
  if (touchedTiming) {
    try {
      const { data: row } = await supabase.from('calendar_blocks')
        .select('property_id, platform, start_date, end_date, early_checkin_time, late_checkout_time, door_code')
        .eq('id', id).single()
      const code = String(row?.door_code || '').replace(/\D/g, '').slice(-4)
      if (row && code) {
        const startsAt = windowFromBooking(row.start_date, row.early_checkin_time, false)
        const endsAt = windowFromBooking(row.end_date, row.late_checkout_time, true)
        lockUpdate = await reprogramBookingWindow({
          propertyId: row.property_id,
          platform: row.platform || 'direct',
          code, startsAt, endsAt,
        })
        /*  `updated` used to be results.length, so an edit that reached no lock
         *  still reported a window move. It counts successes now, and a lock the
         *  edit did not reach raises the alert rather than returning quietly. */
        if (!lockUpdate.ok) {
          await lockActionNeeded({
            intent: 'reschedule', propertyId: row.property_id, code,
            locks: lockUpdate.failedLocks || [], bookingId: id, bookingKind: 'platform',
            who: 'dates or times edited on the calendar',
            window: { startsAt, endsAt },
            error: lockUpdate.results?.find((x: any) => x.error)?.error || 'lock unreachable',
          })
        }
      }
    } catch (e: any) {
      lockUpdate = { ok: false, error: e?.message || 'reprogram failed' }
      await lockActionNeeded({
        intent: 'reschedule', propertyId: (body as any).property_id || 'unknown',
        bookingId: id, bookingKind: 'platform',
        who: 'dates or times edited on the calendar',
        error: e?.message || 'reprogram failed',
      })
    }
  }

  return NextResponse.json({ ok: true, lockUpdate, lock_ok: lockUpdate ? lockUpdate.ok !== false : null })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Was any authenticated user. The per-reason rules below only protected OWNER
  // blocks, so a cleaner could delete a cleaning block — or a real booking row,
  // since is_booking rows live in this table too.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  // load the block to check its type + ownership
  const { data: block } = await supabase.from('calendar_blocks')
    .select('reason, blocked_by, property_id, start_date, end_date, guest_name, is_booking, ical_uid, payout_amount, confirmation_code')
    .eq('id', id).maybeSingle()
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })

  /*  A BOOKING IS NEVER DELETED HERE, BY ANYONE - owner included.
   *
   *  is_booking rows share this table with blocks, and until now the per-reason
   *  rule below only covered reason='owner', so every booking fell straight
   *  through to the delete. On the calendar the same row renders with a
   *  "Remove block" x, which made it two clicks to destroy a reconciled stay.
   *
   *  What that cost: the row's payout, tax split, MAT, confirmation code and
   *  guest link, plus every dependent row - booking_guests, payments,
   *  stay_group_members and conversations all reference this id and NONE of them
   *  is a foreign key, so nothing cascades and nothing complains. Then ical-sync
   *  re-inserts a bare row on its next run and the calendar looks correct again,
   *  which is the worst part: the loss leaves no visible trace.
   *
   *  Cancellation does all of this properly - it marks status, keeps every
   *  figure, reverses the money and tax per platform, frees the dates and
   *  revokes the code. There is no case deletion serves that cancellation does
   *  not serve better, so this refuses rather than gates. */
  if (block.is_booking) {
    return NextResponse.json({
      error: "Bookings can't be deleted here — use Cancel or refund, which preserves the reconciled figures.",
      detail: 'Deleting this row would drop its payout, tax split and guest link, orphan every payment and '
        + 'guest record pointing at it, and the iCal sync would then re-create a hollow row that looks correct. '
        + 'Cancelling keeps the figures and reverses the money properly.',
      booking: {
        guest: block.guest_name, confirmation_code: block.confirmation_code,
        dates: `${block.start_date} → ${block.end_date}`,
        payout_amount: block.payout_amount ?? null,
      },
      use_instead: 'POST /api/admin/bookings/cancel',
    }, { status: 403 })
  }

  /*  Owner blocks: the permission decides IF you may remove one, blocked_by
      decides WHICH. canDeleteOwnBlocks short-circuits true for owner and
      superadmin, so the old role test is folded into it rather than duplicated -
      but the blocked_by comparison stays, because that is the part doing the
      real scoping and no permission flag can express it.

      Inert today: there are no reason='owner' rows. Correct anyway. */
  if (block.reason === 'owner') {
    if (!await canDeleteOwnBlocks()) {
      return NextResponse.json({ error: 'Not allowed to remove owner blocks' }, { status: 403 })
    }
    if (auth.role !== 'owner' && !auth.isSuperadmin
        && block.blocked_by && block.blocked_by !== auth.userId) {
      return NextResponse.json({ error: 'You can only remove your own blocks' }, { status: 403 })
    }
  }

  const { error } = await supabase.from('calendar_blocks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logCalendarActivity({
    propertyId: block.property_id || '',
    eventType: block.is_booking ? 'cancelled' : 'block_removed',
    description: block.is_booking
      ? `${block.guest_name || 'Guest'} — booking removed (${block.start_date} → ${block.end_date})`
      : `Block removed (${block.start_date} → ${block.end_date})`,
    bookingId: id, bookingKind: 'platform', guestName: block.guest_name || null,
    actorId: auth.ok ? auth.userId : null, actorName: auth.ok ? auth.name : null,
  })
  /*  A synced row does not stay deleted: it has a feed UID, so the next sync
      finds no match and inserts it again. Not dangerous - door_code refills from
      the feed too - but hand-typed guest_name and notes do not come back. Say so
      rather than let it look permanent. */
  const warning = block.ical_uid
    ? 'This row came from a platform feed, so the next sync will re-create it. Anything typed on it by hand '
      + '(guest name, notes) will not come back. To keep the dates free, block them or remove the stay on the platform.'
    : null

  return NextResponse.json({ ok: true, ...(warning ? { warning } : {}) })
}
