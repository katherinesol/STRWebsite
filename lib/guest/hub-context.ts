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
import { createAdminClient } from '@/lib/supabase/server'
import { addressState, showsAddress, guestAddressCopy, type AddressState } from '@/lib/address-visibility'
import { loadProperty } from '@/lib/properties-db'

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


/*  What a verified guest is allowed to know about the address.
 *
 *  EVERY RULE COMES FROM lib/address-visibility, UNCHANGED. The 24-hour gate,
 *  the Toronto wall-clock arithmetic that survives a DST boundary, the
 *  request/approve states and the copy that never says "denied" — all of it is
 *  the portal's, already live for direct bookings. This adds no logic; it
 *  supplies the same function with the booking the cookie resolved, so the
 *  identical rule now covers the 43 platform guests it could never reach.
 *
 *  THE ADDRESS IS FETCHED ONLY IF IT WILL BE SHOWN. showsAddress() is consulted
 *  BEFORE the property is loaded, so on a "not yet" the street never enters this
 *  process, let alone the response. Loading it and declining to render it would
 *  put it in the payload — which is precisely the bug that put a full address on
 *  a public listing earlier this year. */
export type HubAddress = {
  state: AddressState
  /** Present ONLY when the state permits it. Absent otherwise — never blank. */
  address?: string
  /** What to say instead. Null when the address itself is shown. */
  message: string | null
  canRequest: boolean
}

export async function hubAddress(booking: GuestBooking, now = new Date()): Promise<HubAddress> {
  const supabase = createAdminClient()

  const { data: request } = await supabase
    .from('address_requests')
    .select('status, decided_at')
    .eq('booking_id', booking.booking_id)
    .eq('booking_kind', booking.source)
    .maybeSingle()

  /*  check-in TIME comes from the property; the DATE from the booking. */
  const property = await loadProperty(booking.property_id)
  const state = addressState({
    checkInDate: booking.check_in,
    checkInTime: property?.checkIn ?? null,
    request: request ? { status: request.status as any } : null,
    now,
  })

  if (!showsAddress(state)) {
    return {
      state,
      message: guestAddressCopy(state),
      //  asking again changes nothing while one is outstanding or settled
      canRequest: state === 'hidden' || state === 'withheld',
    }
  }

  const address = property?.address
  if (!address) {
    //  nothing on file. Say so plainly rather than rendering an empty line.
    return { state, message: 'Your host has not added the address yet — message them and they will send it.', canRequest: false }
  }
  return { state, address, message: null, canRequest: false }
}
