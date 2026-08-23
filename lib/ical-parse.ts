// Pure iCal parsing — no database, no server imports, so it can be tested directly.
//
// UID is the important field: it is the only thing in a feed that survives the
// platform moving a booking's dates. Identifying a synced row by (start, end) meant
// a manual date edit looked like a brand new booking, which is how a duplicate got
// inserted and the edit reverted.

export type ICalEvent = { uid: string; start: string; end: string; summary: string }

export function parseICal(icalText: string): ICalEvent[] {
  const events: ICalEvent[] = []
  const lines = icalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let inEvent = false
  let uid = ''
  let start = ''
  let end = ''
  let summary = ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'BEGIN:VEVENT') { inEvent = true; uid = ''; start = ''; end = ''; summary = '' }
    if (trimmed === 'END:VEVENT') {
      // skip Airbnb/VRBO "not available" and owner-blocked events — they are NOT bookings
      const s = summary.toLowerCase()
      const isBlockMarker = s.includes('not available') || s.includes('unavailable') || s.includes('blocked')
      if (start && end && !isBlockMarker) events.push({ uid, start, end, summary })
      inEvent = false
    }
    if (inEvent) {
      if (trimmed.startsWith('UID')) {
        uid = trimmed.split(':').slice(1).join(':').trim()
      }
      if (trimmed.startsWith('SUMMARY')) {
        summary = trimmed.split(':').slice(1).join(':').trim()
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

export function detectPlatform(url: string): string {
  if (url.includes('airbnb')) return 'airbnb'
  if (url.includes('vrbo') || url.includes('homeaway')) return 'vrbo'
  if (url.includes('houfy')) return 'houfy'
  return 'manual'
}

