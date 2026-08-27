/*  What a cancellation actually does to the world.
 *
 *  ONE QUESTION DRIVES EVERYTHING, and it is not the amount: did the guest stay?
 *  The same $300 means opposite things. A guest who never arrived should have
 *  their dates reopened and their door code killed. A guest who stayed and was
 *  given $300 back as goodwill must keep both — reopening dates they occupied
 *  would offer a booked week to someone else, and revoking their code mid-stay
 *  locks a paying guest out of the house. Nothing here is ever inferred from the
 *  money.
 *
 *  THE LOCK DECISION IS SEPARATED FROM THE LOCK CALL on purpose. Programming a
 *  lock is a live Seam call with a real-world effect that cannot be undone by a
 *  rollback, so the decision is a pure function that can be exercised in every
 *  combination without a lock existing anywhere near the test. Only the caller
 *  turns a decision into an action, and only on confirm — never on preview. */

export type StaySignal = {
  stayed: boolean
  endDate: string | null      // yyyy-mm-dd
  today: string               // yyyy-mm-dd
  code: string | null         // whatever is stored; digits are extracted here
}

export type LockDecision = {
  action: 'revoke' | 'skip'
  code: string | null
  reason: string
}

export function decideLock(s: StaySignal): LockDecision {
  const code = String(s.code || '').replace(/\D/g, '').slice(-4) || null

  /*  A goodwill refund touches locks NOT AT ALL. This is first because it
      outranks everything below it: the guest stayed, so whatever the dates say
      and whatever code is on the row, it is theirs and it stays. */
  if (s.stayed) {
    return { action: 'skip', code, reason: 'The guest stayed, so their access is left exactly as it is.' }
  }

  if (!code) {
    return { action: 'skip', code: null, reason: 'No door code was ever set on this booking.' }
  }

  /*  THE GUARD THAT MATTERS. Four-digit codes get reused, and the sweep hands
      the next guest a code the moment the last stay ends. Revoking on a stay
      that has already finished therefore risks deleting the code the CURRENT
      occupant is using to get in — a lockout caused by cancelling a booking
      that ended weeks ago. ical-sync has always had this guard; it is the same
      rule, stated once, here.  */
  if (!s.endDate || s.endDate < s.today) {
    return {
      action: 'skip', code,
      reason: `The stay ended ${s.endDate || 'at an unknown date'}, so ${code} may already have been reissued `
        + `to the next guest. It is left alone rather than risk locking someone out.`,
    }
  }

  return { action: 'revoke', code, reason: `Code ${code} will be revoked from every active lock at the property.` }
}

/*  Whether cancelling actually frees the dates anywhere a booker can see.
 *
 *  It depends entirely on who owns the calendar, and only one of the two is ours
 *  to move. A DIRECT booking lives in our table and is published by our own iCal
 *  feed, which selects status in (confirmed, active) — so marking it cancelled
 *  drops the event and the platforms pick that up on their next fetch. A
 *  PLATFORM booking is the opposite: /api/calendar reads Airbnb's and VRBO's
 *  feeds directly, and the date stays blocked until THEY drop the event from
 *  THEIR feed. Cancelling here cannot do that and must not claim to. Saying
 *  "dates freed" over a booking we do not control is how a double booking
 *  happens. */
export function dateEffect(bookingKind: 'direct' | 'platform', platform: string | null, stayed: boolean): {
  frees: boolean
  message: string
} {
  if (stayed) {
    return { frees: false, message: 'Dates are unchanged — the guest stayed, so the stay stands.' }
  }
  if (bookingKind === 'direct') {
    return {
      frees: true,
      message: 'The dates reopen. Our iCal feed publishes confirmed bookings only, so this drops out of it '
        + 'and the platforms free the dates on their next fetch.',
    }
  }
  const name = platform ? platform[0].toUpperCase() + platform.slice(1) : 'The platform'
  return {
    frees: false,
    message: `${name} will free this date when it drops the booking from its feed — we don't control that. `
      + `The calendar reads their feed directly, so the date stays blocked here until it does.`,
  }
}
