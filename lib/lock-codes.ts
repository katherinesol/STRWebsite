/*  CODE SELECTION MOVED TO THE WORKER, and it had to.
 *
 *  This used to ask Seam which codes were already on a property's locks and pick
 *  one that was free. codesInUse caught per-lock errors and returned an EMPTY
 *  SET on failure — deliberately, so a booking would not fail over an unreadable
 *  lock — which meant that once Seam stopped answering it was choosing blind
 *  every time while looking exactly as it always had. A collision would then be
 *  discovered by a guest whose code opened someone else's stay.
 *
 *  The server has no way to read a lock now, so it stops pretending to. It
 *  states a PREFERENCE — the guest's last four digits, which is the convention
 *  everywhere and matches what Airbnb publishes — and the worker, which can see
 *  the device, resolves any collision and writes back what it actually
 *  programmed. lock_actions.code is the request; lock_actions.code_final is the
 *  fact. */

/** Last four digits of a phone, or null if there aren't four. */
export function lastFour(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

/*  The code we would LIKE this guest to have. Never a guarantee: only the worker
    knows what is on the lock. A null means "worker, you choose" — which is also
    what happens when the guest gave no phone number. */
export function preferredGuestCode(phone?: string | null): string | null {
  return lastFour(phone)
}
