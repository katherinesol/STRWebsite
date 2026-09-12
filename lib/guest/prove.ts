import { cookies } from 'next/headers'
import { COOKIE, read } from '@/lib/guest/session'

/*  Does the caller hold a session for THIS booking?
 *
 *  Five guest endpoints proved identity the same way: ilike the confirmation
 *  code against the row in the WHERE clause. That still works and still runs —
 *  but a guest who resumed from a cookie no longer has the code in the page,
 *  because it is deliberately not kept anywhere readable now. So each of those
 *  endpoints asks this first, and only falls back to the code when the answer
 *  is no.
 *
 *  BOUND TO ONE BOOKING. A session issued for one stay returns false for any
 *  other booking_id, so a valid cookie is never a skeleton key — it is proof of
 *  exactly the booking it was cut for, and nothing else. */
export async function sessionMatches(bookingId: string | null | undefined): Promise<boolean> {
  if (!bookingId) return false
  try {
    const jar = await cookies()
    const s = read(jar.get(COOKIE)?.value)
    return !!s && s.bid === bookingId
  } catch {
    return false
  }
}
