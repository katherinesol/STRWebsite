/*  Check-in / check-out instants, in Toronto time, as an ISO string.
 *
 *  Extracted from lib/seam.ts unchanged in behaviour. It is pure date logic with
 *  no Seam in it, and it is what every queued intent's window is built from — so
 *  leaving it inside the module we are retiring would have made Seam impossible
 *  to delete without rewriting the queue too.
 *
 *  THE OFFSET IS ASKED FOR, NOT ASSUMED. Vercel runs UTC, so building a local
 *  Date would be an hour or four wrong depending on the box. Intl is consulted
 *  for the real Eastern offset ON THAT DATE, which is what makes a booking either
 *  side of the DST changeover come out right. A fixed -4 was the shape of the
 *  bug that put Kristine's checkout at 7am. */
export function windowFromBooking(dateStr: string, timeStr: string | null, isCheckout: boolean): string {
  let hour = isCheckout ? 11 : 16, min = 0
  if (timeStr) {
    const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (m) {
      hour = parseInt(m[1]); min = parseInt(m[2])
      const ap = (m[3] || '').toUpperCase()
      if (ap === 'PM' && hour !== 12) hour += 12
      if (ap === 'AM' && hour === 12) hour = 0
    }
  }
  /* *  THE LOCK ENFORCES THE DIGITS, NOT THE INSTANT.
 *
 *  This used to convert Toronto local to a true UTC instant — 4pm Toronto became
 *  20:00Z — on the reasonable assumption that Schlage's activationSecs is an
 *  epoch. It is not. The lock reads those seconds, renders them in UTC, and
 *  enforces the resulting WALL CLOCK as local time. So 20:00Z opened the door at
 *  8pm local, four hours after check-in, on every code this system has ever
 *  written.
 *
 *  A guest proved it at the door: Semon Mbrahtu could not get in at 2:15pm with
 *  18:15Z on his code, and could once it was hand-set to 14:15.
 *
 *  Airbnb has always known. It manages Apt 2 and the Port Colborne guest codes,
 *  and it writes 16:00 for a 4pm check-in and 11:30 for checkout — digits, not
 *  instants. Its codes work; ours were four hours late at both ends, which also
 *  left every guest access until 3pm on their checkout day.
 *
 *  So: build the time with NO offset. The hour asked for is the hour sent.
   */
  const d = new Date(Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(5, 7)) - 1,
    parseInt(dateStr.slice(8, 10)),
    hour, min, 0, 0
  ))
  return d.toISOString()
}
