/*  Which properties have physical sensors on them.
 *
 *  IT LIVES HERE, NOT IN StayConditions, BECAUSE OF WHO CALLS IT. The function
 *  is one line of pure logic, but it was exported from a 'use client' module
 *  and called by BookingDetail, which is a server component. Next.js turns a
 *  client export into a reference proxy on the server and throws the moment it
 *  is CALLED:
 *
 *      Error: Attempted to call HAS_SENSORS() from the server but
 *      HAS_SENSORS is on the client.
 *
 *  It shipped on 27 August and surfaced as an intermittent 500 on stay detail
 *  pages — intermittent because whether the proxy throws depends on how the
 *  chunk graph resolved on that render, so the same booking returned 200 and
 *  then 500 three times in a row. An error that comes and goes on one page and
 *  not its neighbour reads like bad data, which is exactly where the first
 *  hour of looking went.
 *
 *  A pure predicate has no business on either side of that boundary. Here it is
 *  importable from both. */
export const HAS_SENSORS = (propertyId: string) => propertyId === 'nickel-beach'
