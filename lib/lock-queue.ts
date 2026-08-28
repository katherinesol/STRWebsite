import { createAdminClient } from '@/lib/supabase/server'
import { lockActionNeeded } from '@/lib/lock-alert'
import type { LockIntent } from '@/lib/lock-events'

/*  RECORDING WHAT A LOCK SHOULD DO, since the server cannot do it.
 *
 *  This is the only way an intent enters the queue. It exists as one function
 *  rather than five call-sites building rows because THE AIRBNB SKIP RULE LIVES
 *  HERE, ONCE. It used to be written out separately in five places — seam.ts
 *  twice, both sweep loops and the cron — and the fifth copy was the blanket
 *  Nickel skip that sat in the wrong loop and left Airbnb guests with no code
 *  from anyone. A rule copied five times is a rule that will disagree with
 *  itself; a rule in one function cannot.
 *
 *  THE RULE, and it is narrower than it looks: skip a lock only when the booking
 *  is Airbnb AND that lock is airbnb_managed. A VRBO, Houfy or direct guest gets
 *  every door, including the Airbnb-managed ones, because Airbnb is not involved
 *  in their stay and will not code anything for them. shawn robins at Nickel
 *  Beach is the live example — Port Colborne is airbnb_managed since the flags
 *  were corrected from evidence, and he must still be programmed onto it.
 *
 *  WHICH LOCKS ARE AIRBNB'S WAS WRONG UNTIL 2026-08-28. The flag had been typed
 *  in by hand and never checked; reading the locks showed Airbnb's fingerprint
 *  (standing "Airbnb Backup" codes) on Port Colborne, which was flagged false,
 *  and absent from Royal York Apt 1, which was flagged true. Both are corrected
 *  in property_locks now, and this function trusts the column again — but the
 *  reason to distrust it was that nothing had ever tested it. The worker's sweep
 *  is what tests it from now on. */

export type BookingKind = 'platform' | 'direct'

export type QueueResult = {
  queued: { lock: string; id: string; action: LockIntent }[]
  skipped: { lock: string; why: string }[]
  failed: { lock: string; error: string }[]
  ok: boolean
}

export async function queueForBooking(opts: {
  bookingId: string
  bookingKind: BookingKind
  propertyId: string
  /** 'airbnb' | 'vrbo' | 'houfy' | 'direct' | null — decides the skip */
  platform?: string | null
  action: LockIntent
  code?: string | null
  /** ISO instants; omit for a revoke */
  startsAt?: string | null
  endsAt?: string | null
  requestedBy?: string | null
  /** for the alert text if nothing can be queued */
  who?: string | null
}): Promise<QueueResult> {
  const supabase = createAdminClient()
  const isAirbnb = String(opts.platform || '').toLowerCase() === 'airbnb'

  const { data: locks } = await supabase
    .from('property_locks')
    .select('id, lock_name, airbnb_managed, schlage_device_id')
    .eq('property_id', opts.propertyId)
    .eq('active', true)

  const out: QueueResult = { queued: [], skipped: [], failed: [], ok: true }

  for (const lock of locks || []) {
    if (isAirbnb && lock.airbnb_managed) {
      out.skipped.push({ lock: lock.lock_name, why: 'Airbnb codes this door itself' })
      continue
    }
    /*  A lock with no device id cannot be acted on by the worker. The RPC
        refuses it too, but catching it here names the lock in the alert rather
        than surfacing a Postgres exception to whoever pressed the button. */
    if (!lock.schlage_device_id) {
      out.failed.push({ lock: lock.lock_name, error: 'no schlage_device_id — the worker cannot reach this lock' })
      out.ok = false
      continue
    }

    const { data, error } = await supabase.rpc('queue_lock_action', {
      p_booking_id: opts.bookingId,
      p_booking_kind: opts.bookingKind,
      p_lock_id: lock.id,
      p_action: opts.action,
      p_code: opts.code ?? null,
      p_starts_at: opts.startsAt ?? null,
      p_ends_at: opts.endsAt ?? null,
      p_requested_by: opts.requestedBy ?? null,
    })

    if (error) {
      out.failed.push({ lock: lock.lock_name, error: error.message })
      out.ok = false
    } else {
      out.queued.push({ lock: lock.lock_name, id: (data as any)?.id, action: opts.action })
    }
  }

  /*  FAILING TO RECORD AN INTENT IS WORSE THAN FAILING TO EXECUTE ONE. A queued
      row that the worker cannot drain is visible and retried; an intent that
      never reached the queue is the silent no-op this whole exercise removed.
      So a queue failure raises the same alert a lock failure would. */
  if (!out.ok) {
    await lockActionNeeded({
      intent: opts.action,
      propertyId: opts.propertyId,
      code: opts.code,
      locks: out.failed.map(f => f.lock),
      bookingId: opts.bookingId,
      bookingKind: opts.bookingKind,
      who: opts.who,
      window: { startsAt: opts.startsAt, endsAt: opts.endsAt },
      error: `could not be queued: ${out.failed.map(f => f.error).join('; ')}`,
    })
  }

  return out
}
