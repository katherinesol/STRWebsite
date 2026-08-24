/** The date, in Toronto, regardless of where the server thinks it is.
 *
 *  Today used `format(new Date(), 'yyyy-MM-dd')`, which formats in the server's
 *  local zone. Vercel runs UTC. So from 8pm Toronto onward the page rolled over
 *  to tomorrow — not just in the heading, but in every filter built from it:
 *  arrivals, departures, in-residence, the week, the 72-hour code check. At
 *  00:05 UTC the page was answering "who is here today" about tomorrow.
 *
 *  en-CA gives ISO order, so this yields YYYY-MM-DD without hand-assembly. */

export const TZ = 'America/Toronto'

export function torontoDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

export function torontoParts(d: Date = new Date()) {
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-CA', { timeZone: TZ, ...o })
  return {
    iso: torontoDate(d),
    weekday: f({ weekday: 'long' }),
    month: f({ month: 'long' }),
    day: Number(f({ day: 'numeric' })),
    hour: Number(d.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })),
  }
}

/** Add days and come back with a Toronto ISO date, never crossing a zone. */
export function torontoPlus(days: number, from: Date = new Date()): string {
  const base = new Date(torontoDate(from) + 'T12:00:00Z')
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}
