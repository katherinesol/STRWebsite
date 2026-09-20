/*  The booking context a hub page is allowed to have.
 *
 *  THE PROPERTY CHECK IS THE WHOLE POINT OF THIS FILE. A session cookie is
 *  proof of ONE booking at ONE property. The hub is keyed on property, so
 *  without this check a guest holding a valid Royal York session could open
 *  /hub/nickel-beach and be handed Nickel Beach's booking context — a real
 *  guest, a real cookie, somebody else's house. The property id is inside the
 *  signed payload precisely so it cannot be edited; this is where it is
 *  compared.
 *
 *  NOTHING IS FETCHED BEFORE THE CHECK PASSES. That ordering is deliberate and
 *  is the difference between a page that hides a booking and a page that never
 *  had one. The address leak earlier this year was a field no component
 *  rendered, sitting in the payload the whole time — not-rendered is not
 *  not-sent, and the only reliable way to keep something out of the bytes is to
 *  never load it.
 *
 *  So the order is: read cookie → verify signature → compare property → only
 *  then touch the database. A mismatch returns before a single query runs. */

import { cookies } from 'next/headers'
import { COOKIE, read } from '@/lib/guest/session'
import { loadSessionBooking, type GuestBooking } from '@/lib/guest/booking'

export type HubContext =
  | { verified: true; booking: GuestBooking }
  | { verified: false; reason: 'no-cookie' | 'bad-cookie' | 'wrong-property' | 'booking-gone' }

/** Reads the cookie jar. Thin, so the decision below can be tested without one. */
export async function hubContext(propertyId: string): Promise<HubContext> {
  let raw: string | undefined
  try { raw = (await cookies()).get(COOKIE)?.value } catch { return { verified: false, reason: 'no-cookie' } }
  return resolveHubContext(propertyId, raw)
}

/*  The decision itself, taking the cookie value rather than fetching it, so the
 *  property comparison can be exercised against a real signed token outside a
 *  request. A check that can only be tested by running the whole framework is a
 *  check that does not get tested. */
export async function resolveHubContext(propertyId: string, raw: string | undefined): Promise<HubContext> {
  if (!raw) return { verified: false, reason: 'no-cookie' }

  const session = read(raw)
  if (!session) return { verified: false, reason: 'bad-cookie' }

  /*  Before any query. A cookie for another property is treated exactly as no
   *  cookie at all — the page that follows cannot tell the difference, and has
   *  nothing extra to leak either way. */
  if (session.pid !== propertyId) return { verified: false, reason: 'wrong-property' }

  const booking = await loadSessionBooking(session.kind, session.bid)
  if (!booking) return { verified: false, reason: 'booking-gone' }

  /*  Belt and braces. The signature proved the cookie; the row is the truth. If
   *  a booking were ever moved between properties after the cookie was cut, the
   *  signed claim would be stale — so the row is checked too. */
  if (booking.property_id !== propertyId) return { verified: false, reason: 'wrong-property' }

  return { verified: true, booking }
}
