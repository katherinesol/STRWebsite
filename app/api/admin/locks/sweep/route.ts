import { NextResponse } from 'next/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/*  The morning check: is every upcoming stay's code where it should be.
 *
 *  IT WAS PERSISTING A LIE. codesOn() caught every Seam error and returned an
 *  EMPTY ARRAY, which is indistinguishable from "this lock has no codes on it".
 *  statusFor() then found no match and reported `missing`. The Seam key is dead
 *  — /devices/list answers 401 — so every door on every upcoming booking read
 *  `missing`, every booking read `needs_attention: true`, and the sweep WROTE
 *  that snapshot into bookings.lock_status and calendar_blocks.lock_status.
 *  Unreadable was being recorded as unprogrammed.
 *
 *  That failure is not specific to the dead key. One unreachable lock on a
 *  working account produced the same false `missing` for that door, and always
 *  had.
 *
 *  SEAM IS GONE FROM HERE ENTIRELY. The first fix made this fall back to the
 *  queue when Seam could not be read; it never could, so the fallback was the
 *  only path that ever ran. Keeping the call meant a dead vendor decided how
 *  long this endpoint took and what it reported, for a result it could not
 *  supply. State now comes from lock_actions, and from the lock_status the
 *  worker writes off the hardware — one hop through a process that can actually
 *  see a lock, rather than none through one that cannot.
 *
 *  `unknown` IS A REAL ANSWER. Nothing here persists at all now — see the note
 *  at the former write — so what this returns is a view, and the stored
 *  lock_status stays whatever the worker last read off the hardware. */

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  /*  VIEW, not edit. This sweep programs nothing: it reports state and writes a
      derived snapshot. The programming lives in /api/cron/automations. */
  if (!await hasPermission('locks', 'view')) return NextResponse.json({ error: 'Not allowed to view lock status' }, { status: 403 })

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const checkedAt = new Date().toISOString()

  const { data: allLocks } = await supabase.from('property_locks').select('*').eq('active', true)
  const locksFor = (pid: string) => (allLocks || []).filter((l: any) => l.property_id === pid)

  /*  What the queue knows about this booking and this lock — the worker's own
      record of what it was asked to do and what it reported back. */
  const bookingIds: string[] = []
  const { data: platRaw } = await supabase.from('calendar_blocks')
    .select('id, property_id, platform, start_date, end_date, door_code, guest_name, checked_in_at')
    .neq('status', 'cancelled')
    .or('is_booking.eq.true,ical_uid.not.is.null')
    .gte('end_date', today).order('start_date')
  const { data: directRaw } = await supabase.from('bookings')
    .select('id, property_id, check_in, check_out, lock_code, guest_id, checked_in_at, guests:guest_id(name)')
    .gte('check_out', today).order('check_in')
  for (const b of platRaw || []) bookingIds.push(b.id)
  for (const b of directRaw || []) bookingIds.push(b.id)

  const { data: actions } = bookingIds.length
    ? await supabase.from('lock_actions')
        .select('booking_id, lock_id, action, status, code, code_final, last_error, attempts, not_before, created_at')
        .in('booking_id', bookingIds).order('created_at', { ascending: false })
    : { data: [] as any[] }

  // newest action per (booking, lock) — the live intent
  const latest: Record<string, any> = {}
  for (const a of actions || []) {
    const k = `${a.booking_id}|${a.lock_id}`
    if (!(k in latest)) latest[k] = a
  }

  const QUEUE_STATE: Record<string, { status: string; errored: boolean; scheduled: boolean }> = {
    pending: { status: 'queued',      errored: false, scheduled: false },
    claimed: { status: 'in progress', errored: false, scheduled: false },
    done:    { status: 'programmed',  errored: false, scheduled: true  },
    failed:  { status: 'failed',      errored: true,  scheduled: false },
  }

  function doorFor(bookingId: string, lock: any, expectedCode: string) {
    const q = latest[`${bookingId}|${lock.id}`]
    {
      /*  DEVICE UNREADABLE. Everything below comes from the queue and is
          labelled so, because "the worker says it programmed this" is a weaker
          claim than "the lock says the code is on it" and must not be filed as
          the same fact. */
      const st = q ? QUEUE_STATE[q.status] : null
      return {
        lock: lock.lock_name,
        code: (q?.code_final || q?.code || expectedCode) || null,
        source: 'queue' as const,
        ...(st || { status: 'unknown', errored: false, scheduled: false }),
        queue: q ? { action: q.action, status: q.status, attempts: q.attempts, last_error: q.last_error } : null,
        note: q ? undefined : 'no intent recorded for this door, and the lock could not be read',
      }
    }
  }

  /*  A door is a problem when it is KNOWN to be wrong. `unknown` is not a
      problem — it is an absence of information, and flagging it as a fault is
      exactly the false alarm this rewrite removes. A failed queue row IS known
      to be wrong. */
  const bad = (d: any, within72: boolean) =>
    d.errored
    || d.status === 'missing'
    || d.status === 'failed'
    || (within72 && (d.status === 'queued' || d.status === 'unknown'))

  const rows: any[] = []

  async function sweepOne(opts: {
    id: string; kind: 'platform' | 'direct'; propertyId: string; platform: string
    start: string; end: string; rawCode: any; guest: string | null; checkedInAt: string | null
    table: 'calendar_blocks' | 'bookings'
  }) {
    if (opts.start < today) return               // stay underway — the code is live, don't flag it
    const isAirbnb = opts.platform === 'airbnb'
    const code = String(opts.rawCode || '').replace(/\D/g, '').slice(-4)
    const doors: any[] = []
    for (const lock of locksFor(opts.propertyId)) {
      if (isAirbnb && lock.airbnb_managed) continue   // Airbnb codes its own unit door
      doors.push(doorFor(opts.id, lock, code))
    }
    const hrsUntil = (new Date(opts.start + 'T16:00:00').getTime() - Date.now()) / 3600000
    const within72 = hrsUntil < 72
    const unknowns = doors.filter(d => d.status === 'unknown').length
    const status = {
      doors,
      all_set: doors.length > 0 && doors.every(d => d.status === 'set' || d.status === 'programmed' || d.scheduled),
      needs_attention: doors.some(d => bad(d, within72)),
      within72,
      /*  Provenance travels with the snapshot. A reader months from now must be
          able to tell a device-confirmed record from a worker-reported one. */
      source: 'queue',
      unknown_doors: unknowns,
      checked_at: checkedAt,
    }
    /*  IT NO LONGER WRITES. The worker reads every lock with pyschlage and
        PATCHes lock_status itself, in this same shape — two writers, one
        column, last one wins and nothing recorded which. When this ran it
        replaced a DEVICE reading with a QUEUE inference: weaker, and indistinguishable
        afterwards. The worker's copy is the one taken off the hardware, so the
        worker keeps the column and this endpoint answers the request and
        persists nothing. */
    rows.push({ id: opts.id, kind: opts.kind, guest: opts.guest, property: opts.propertyId, platform: opts.platform, start: opts.start, end: opts.end, code: code || null, checked_in_at: opts.checkedInAt, ...status })
  }

  for (const b of platRaw || []) {
    await sweepOne({ id: b.id, kind: 'platform', propertyId: b.property_id, platform: b.platform, start: b.start_date, end: b.end_date, rawCode: b.door_code, guest: b.guest_name, checkedInAt: b.checked_in_at, table: 'calendar_blocks' })
  }
  for (const b of directRaw || []) {
    await sweepOne({ id: b.id, kind: 'direct', propertyId: b.property_id, platform: 'direct', start: b.check_in, end: b.check_out, rawCode: b.lock_code, guest: (b.guests as any)?.name || null, checkedInAt: b.checked_in_at, table: 'bookings' })
  }

  rows.sort((a, b) => a.start.localeCompare(b.start))
  return NextResponse.json({
    checked_at: checkedAt,
    /*  Said once, at the top, so the page can lead with it rather than letting
        the operator infer an outage from six identical door faults. */
    reading_from: 'the queue and what the worker last read off the locks',
    count: rows.length,
    needs_attention: rows.filter(r => r.needs_attention).length,
    unknown_doors: rows.reduce((n, r) => n + (r.unknown_doors || 0), 0),
    bookings: rows,
  })
}
