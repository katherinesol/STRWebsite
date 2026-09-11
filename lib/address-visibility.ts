/*  WHEN A BOOKED GUEST MAY SEE THE EXACT ADDRESS.
 *
 *  Three rules, and they are independent:
 *
 *    · The public listing never shows it. That is publicProperty()'s job, not
 *      this file's — the address is stripped from the payload entirely.
 *    · A booked guest sees it automatically from 24 hours before check-in.
 *    · Before that, they may ask, and Katherine approves or denies per request.
 *
 *  A DENIAL DOES NOT SUPPRESS THE AUTOMATIC REVEAL. Saying "not yet" to someone
 *  asking a week out is a different decision from withholding the address of the
 *  house they are about to walk into. At T-24h it shows regardless.
 *
 *  ── THE TIMEZONE, WHICH IS THE PART TO GET RIGHT ──
 *
 *  This uses GENUINE Toronto local time. The lock worker writes windows as
 *  "digits-as-local" — 4pm check-in sent as 16:00Z — but that is a workaround for
 *  how Schlage's backend reads activationSecs, NOT a convention that travels. Copy
 *  it here and the address appears four hours early or late; on a Saturday
 *  afternoon check-in that is exactly the difference between before and after.
 *
 *  The check-in moment is built as a wall-clock time IN Toronto and converted to a
 *  real instant, then 24 hours are subtracted from that instant. Literal hours,
 *  not "the same clock time yesterday" — which differ by an hour across a DST
 *  boundary, and a stay beginning the day the clocks change is not a hypothetical
 *  in a region that observes them twice a year.  */

export type AddressState =
  | 'auto'        // within 24h — shown, whatever was requested or decided
  | 'approved'    // before 24h, Katherine said yes
  | 'requested'   // before 24h, waiting on her
  | 'withheld'    // before 24h, she said no — the guest is never told "denied"
  | 'hidden'      // before 24h, nothing asked yet

/** The offset Toronto is at on a given instant, in minutes. */
function torontoOffsetMinutes(at: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto', timeZoneName: 'longOffset',
  })
  const part = fmt.formatToParts(at).find(p => p.type === 'timeZoneName')?.value || 'GMT-05:00'
  const m = part.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return -300
  const sign = m[1] === '-' ? -1 : 1
  return sign * (parseInt(m[2]) * 60 + parseInt(m[3]))
}

/** A Toronto wall-clock date and time as a real instant.
 *
 *  Done in two passes: guess with the offset that applies at noon UTC on that
 *  date, then re-resolve using the offset that actually applies at the guessed
 *  instant. One correction is enough for every real case — the two differ only
 *  within the changeover hour itself. */
export function torontoWallClock(dateStr: string, timeStr: string | null | undefined): Date {
  let hour = 16, min = 0
  if (timeStr) {
    const m = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (m) {
      hour = parseInt(m[1]); min = parseInt(m[2])
      const ap = (m[3] || '').toUpperCase()
      if (ap === 'PM' && hour !== 12) hour += 12
      if (ap === 'AM' && hour === 12) hour = 0
    }
  }
  const [y, mo, d] = dateStr.split('-').map(Number)
  const naive = Date.UTC(y, mo - 1, d, hour, min, 0, 0)
  const guess = new Date(naive - torontoOffsetMinutes(new Date(naive)) * 60_000)
  return new Date(naive - torontoOffsetMinutes(guess) * 60_000)
}

export const REVEAL_HOURS_BEFORE = 24

/** The instant the address starts showing on its own. */
export function autoRevealAt(checkInDate: string, checkInTime: string | null | undefined): Date {
  return new Date(torontoWallClock(checkInDate, checkInTime).getTime() - REVEAL_HOURS_BEFORE * 3_600_000)
}

export function addressState(opts: {
  checkInDate: string
  checkInTime?: string | null
  request?: { status: 'requested' | 'approved' | 'denied' } | null
  now?: Date
}): AddressState {
  const now = opts.now ?? new Date()
  if (now.getTime() >= autoRevealAt(opts.checkInDate, opts.checkInTime).getTime()) return 'auto'
  switch (opts.request?.status) {
    case 'approved': return 'approved'
    case 'requested': return 'requested'
    case 'denied': return 'withheld'
    default: return 'hidden'
  }
}

export const showsAddress = (s: AddressState) => s === 'auto' || s === 'approved'

/** What the guest reads. Never the word "denied". */
export function guestAddressCopy(s: AddressState): string | null {
  switch (s) {
    case 'auto':
    case 'approved':  return null   // the address itself is shown
    case 'requested': return 'Requested — we’ll confirm shortly.'
    case 'withheld':  return 'We’ll share it closer to your stay.'
    case 'hidden':    return 'Your full address appears here 24 hours before check-in.'
  }
}
