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
  const easternOffsetHours = (() => {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', timeZoneName: 'shortOffset' })
    const part = fmt.formatToParts(new Date(dateStr + 'T12:00:00Z')).find(p => p.type === 'timeZoneName')
    const m = part?.value.match(/GMT([+-]\d+)/)
    return m ? parseInt(m[1]) : -4
  })()
  const d = new Date(Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(5, 7)) - 1,
    parseInt(dateStr.slice(8, 10)),
    hour - easternOffsetHours, min, 0, 0
  ))
  return d.toISOString()
}
