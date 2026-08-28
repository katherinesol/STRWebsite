import { logSystem } from '@/lib/system-log'

/*  ONE SHAPE FOR "A LOCK DID NOT GET THE MESSAGE".
 *
 *  Five separate places can fail to reach a lock — cancel, manual, the calendar
 *  block PATCH, the iCal cron and stay-groups — and before this each of them
 *  either said nothing or said the opposite. Rather than five hand-written log
 *  lines that drift apart, they all call this, so the event type is spelled the
 *  same way everywhere and System Activity can colour it red on one string.
 *
 *  THE SUMMARY LEADS WITH THE INSTRUCTION, not the diagnosis. This event exists
 *  to be actioned from a phone while standing in a hallway, so the first words
 *  are the thing to do and the reason follows. A log line that opens with
 *  "Seam request failed with status 402" buries the only part that matters.
 *
 *  This never throws — logSystem already swallows its own errors, because a
 *  failure to record a lock problem must not also break the cancellation or the
 *  sync that discovered it. */

import { LOCK_ACTION_NEEDED, type LockIntent } from '@/lib/lock-events'
export { LOCK_ACTION_NEEDED }
export type { LockIntent }

function windowText(w?: { startsAt?: string | null; endsAt?: string | null } | null): string {
  if (!w?.startsAt && !w?.endsAt) return ''
  const fmt = (t?: string | null) => {
    if (!t) return '?'
    try {
      return new Date(t).toLocaleString('en-US', {
        timeZone: 'America/Toronto', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    } catch { return String(t) }
  }
  return ` ${fmt(w.startsAt)} → ${fmt(w.endsAt)} (Toronto)`
}

export async function lockActionNeeded(opts: {
  intent: LockIntent
  propertyId: string
  code?: string | null
  /** lock_name values that could not be reached — the ones to touch by hand */
  locks?: string[] | null
  bookingId?: string | null
  bookingKind?: 'platform' | 'direct' | null
  /** guest name or booking reference, so the line is recognisable at a glance */
  who?: string | null
  window?: { startsAt?: string | null; endsAt?: string | null } | null
  error?: string | null
}): Promise<void> {
  const code = opts.code || '(unknown code)'
  const where = opts.locks?.length ? opts.locks.join(', ') : 'the property locks'
  const who = opts.who ? ` — ${opts.who}` : ''

  const byHand =
    opts.intent === 'revoke'
      ? `REVOKE BY HAND: remove code ${code} from ${where}${who}. It is still live on the lock.`
      : opts.intent === 'program'
      ? `PROGRAM BY HAND: put code ${code} on ${where}${who}${windowText(opts.window)}. The guest has no working code.`
      : `RESCHEDULE BY HAND: move code ${code}'s window on ${where}${who} to${windowText(opts.window)}. The dates changed but the lock did not.`

  await logSystem(
    LOCK_ACTION_NEEDED,
    byHand + (opts.error ? ` (${opts.error})` : ''),
    {
      intent: opts.intent,
      code: opts.code || null,
      locks: opts.locks || null,
      booking_id: opts.bookingId || null,
      booking_kind: opts.bookingKind || null,
      starts_at: opts.window?.startsAt || null,
      ends_at: opts.window?.endsAt || null,
      error: opts.error || null,
    },
    opts.propertyId,
  )
}
