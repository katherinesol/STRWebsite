// Single source of truth for check-in / checkout display times.
// Works for both direct bookings (bookings table) and platform bookings (calendar_blocks).
// Three states: granted (confirmed custom time), pending (requested, not yet granted), default.

type TimeState = 'granted' | 'pending' | 'default'
export type TimeDisplay = { time: string; raw: string; state: TimeState; is24: string }

const DEFAULT_IN = '16:00'   // 4:00 PM
const DEFAULT_OUT = '11:00'  // 11:00 AM

function fmt(t: string): string {
  if (!t) return ''
  // already formatted (contains AM/PM) — normalize spacing, pass through
  const up = t.toUpperCase()
  if (up.includes('AM') || up.includes('PM')) {
    const ampm = up.includes('PM') ? 'PM' : 'AM'
    const time = up.replace(/\s*[AP]M\s*/i, '').trim()
    return `${time}${ampm}`
  }
  // 24-hour "HH:MM" → 12-hour
  const [h, m] = t.split(':')
  const hr = parseInt(h, 10)
  if (isNaN(hr)) return t
  const min = (m || '00').padStart(2, '0')
  const ampm = hr >= 12 ? 'PM' : 'AM'
  const h12 = hr % 12 || 12
  return `${h12}:${min}${ampm}`
}

// normalize a booking's raw fields regardless of table
function readFields(b: any) {
  return {
    inFlag: b.early_checkin ?? false,
    inTime: b.early_checkin_time || null,
    inGranted: b.early_checkin_granted ?? null,
    outFlag: b.late_checkout ?? false,
    outTime: b.late_checkout_time || null,
    outGranted: b.late_checkout_granted ?? null,
  }
}

function to24(t: string): string {
  if (!t) return ''
  const up = t.toUpperCase()
  if (up.includes('AM') || up.includes('PM')) {
    const pm = up.includes('PM')
    let [h, m] = up.replace(/\s*[AP]M\s*/i, '').trim().split(':')
    let hr = parseInt(h, 10)
    if (pm && hr !== 12) hr += 12
    if (!pm && hr === 12) hr = 0
    return `${String(hr).padStart(2, '0')}:${(m || '00').padStart(2, '0')}`
  }
  return t
}

function resolve(flag: boolean, time: string | null, granted: boolean | null, def: string): TimeDisplay {
  // compare in 24h so a standard time stored as "11:00 AM" isn't mistaken for a request vs "11:00"
  const isNonStandard = time ? to24(time) !== def : false
  if (time && granted) return { time: fmt(time), raw: time, state: 'granted', is24: to24(time) }
  // only "pending" (shows "req") when it's genuinely a non-standard time AND not yet granted
  if (time && (flag || isNonStandard) && isNonStandard) return { time: fmt(time), raw: time, state: 'pending', is24: to24(time) }
  return { time: fmt(def), raw: def, state: 'default', is24: def }
}

export function getCheckInDisplay(b: any): TimeDisplay {
  const f = readFields(b)
  return resolve(f.inFlag, f.inTime, f.inGranted, DEFAULT_IN)
}

export function getCheckOutDisplay(b: any): TimeDisplay {
  const f = readFields(b)
  return resolve(f.outFlag, f.outTime, f.outGranted, DEFAULT_OUT)
}
