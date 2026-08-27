// Pure iCal parsing — no database, no server imports, so it can be tested directly.
//
// UID is the important field: it is the only thing in a feed that survives the
// platform moving a booking's dates. Identifying a synced row by (start, end) meant
// a manual date edit looked like a brand new booking, which is how a duplicate got
// inserted and the edit reverted.

export type ICalEvent = {
  uid: string; start: string; end: string; summary: string
  /*  The last four digits of the guest's phone, lifted from DESCRIPTION.
   *
   *  This is the door code. Airbnb sets it on the unit door it manages, and we
   *  program the SAME value on our own locks so a guest has one code for every
   *  door — which is why programBookingCode verifies phone.slice(-4) on the
   *  managed lock rather than inventing a number.
   *
   *  It has been sitting in every feed all along and this parser threw it away,
   *  so every door_code in the database was hand-copied off the platform and any
   *  booking nobody got to stayed blank. Five had.
   *
   *  null where the feed does not carry one — which for VRBO is ALWAYS. */
  phoneLast4: string | null
}

export function parseICal(icalText: string): ICalEvent[] {
  const events: ICalEvent[] = []
  const lines = icalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let inEvent = false
  let uid = ''
  let start = ''
  let end = ''
  let summary = ''
  let description = ''
  let collecting = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'BEGIN:VEVENT') { inEvent = true; uid = ''; start = ''; end = ''; summary = ''; description = ''; collecting = false }
    if (trimmed === 'END:VEVENT') {
      // skip Airbnb/VRBO "not available" and owner-blocked events — they are NOT bookings
      const s = summary.toLowerCase()
      const isBlockMarker = s.includes('not available') || s.includes('unavailable') || s.includes('blocked')
      if (start && end && !isBlockMarker) {
        events.push({ uid, start, end, summary, phoneLast4: phoneFrom(description) })
      }
      inEvent = false
    }
    if (inEvent) {
      if (trimmed.startsWith('UID')) {
        uid = trimmed.split(':').slice(1).join(':').trim()
      }
      if (trimmed.startsWith('SUMMARY')) {
        summary = trimmed.split(':').slice(1).join(':').trim()
      }
      /*  DESCRIPTION folds across lines: RFC 5545 wraps at 75 octets and marks
          the continuation with a leading space, so Airbnb's code routinely
          lands split as "…Phone Number (Last 4 Digi" / " ts): 6286". Reading
          only the first physical line finds nothing. The raw text is kept and
          unfolded below rather than parsed line by line. */
      if (trimmed.startsWith('DESCRIPTION')) {
        description = trimmed.split(':').slice(1).join(':')
        collecting = true
        continue
      }
      if (collecting) {
        if (/^[A-Z-]+[;:]/.test(trimmed)) collecting = false
        else { description += trimmed; continue }
      }
      if (trimmed.startsWith('DTSTART')) {
        const raw = trimmed.split(':').pop() || ''
        const digits = raw.replace(/\D/g, '').slice(0, 8)
        if (digits.length === 8) start = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
      }
      if (trimmed.startsWith('DTEND')) {
        const raw = trimmed.split(':').pop() || ''
        const digits = raw.replace(/\D/g, '').slice(0, 8)
        if (digits.length === 8) end = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
      }
    }
  }
  return events
}

/*  The code, or null. Only ever the labelled field — never "any four digits in
 *  the description", because a reservation URL and a date are both full of
 *  four-digit runs and a wrong door code is worse than a blank one. */
export function phoneFrom(description: string): string | null {
  const m = description.replace(/\\n/g, '\n').match(/Phone Number \(Last 4 Digits\)\s*:?\s*(\d{4})/i)
  return m ? m[1] : null
}

export function detectPlatform(url: string): string {
  if (url.includes('airbnb')) return 'airbnb'
  if (url.includes('vrbo') || url.includes('homeaway')) return 'vrbo'
  if (url.includes('houfy')) return 'houfy'
  return 'manual'
}

