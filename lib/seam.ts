import { Seam } from 'seam'
import { createAdminClient } from '@/lib/supabase/server'

function client() {
  const apiKey = process.env.SEAM_API_KEY
  if (!apiKey) throw new Error('SEAM_API_KEY not set')
  return new Seam({ apiKey })
}

// all locks registered for a property (East has 3, West has 2, etc.)
export async function locksForProperty(propertyId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('property_locks')
    .select('seam_device_id, lock_name, code_length')
    .eq('property_id', propertyId).eq('active', true)
  return data || []
}

// program a time-bound code on every lock for a property
export async function programStayCode(opts: {
  propertyId: string
  code: string
  name: string
  startsAt: string   // ISO
  endsAt: string     // ISO
}) {
  const seam = client()
  const locks = await locksForProperty(opts.propertyId)
  const results: any[] = []
  for (const lock of locks) {
    try {
      const ac = await seam.accessCodes.create({
        device_id: lock.seam_device_id,
        name: opts.name,
        code: opts.code,
        starts_at: opts.startsAt,
        ends_at: opts.endsAt,
      })
      results.push({ device_id: lock.seam_device_id, lock_name: lock.lock_name, ok: true, access_code_id: ac.access_code_id, status: ac.status })
    } catch (e: any) {
      results.push({ device_id: lock.seam_device_id, lock_name: lock.lock_name, ok: false, error: e?.message || 'failed' })
    }
  }
  return results
}

// verify a code is actually set (handles the disappearing-code quirk)
export async function verifyCode(accessCodeId: string) {
  const seam = client()
  try {
    const ac = await seam.accessCodes.get({ access_code_id: accessCodeId })
    return { ok: true, status: ac.status } // 'set' means active on the lock
  } catch (e: any) {
    return { ok: false, error: e?.message }
  }
}

export async function deleteCode(accessCodeId: string) {
  const seam = client()
  try { await seam.accessCodes.delete({ access_code_id: accessCodeId }); return { ok: true } }
  catch (e: any) { return { ok: false, error: e?.message } }
}

// list all codes on a device — used for the 100-code cleanup
export async function listCodes(deviceId: string) {
  const seam = client()
  try { const codes = await seam.accessCodes.list({ device_id: deviceId }); return { ok: true, codes } }
  catch (e: any) { return { ok: false, error: e?.message, codes: [] } }
}

// ── the main entry point: program a booking's code, platform-aware ──
// direct bookings: program the guest's code on every lock
// airbnb bookings: program last-4 on OUR locks; skip airbnb-managed unit doors;
//   then read the unit door and flag if airbnb's code doesn't match last-4
import { createAdminClient as _admin } from '@/lib/supabase/server'

export async function programBookingLocks(opts: {
  propertyId: string
  platform: string          // 'direct', 'airbnb', 'vrbo', 'houfy', etc.
  code: string              // the code WE use (last-4 or random)
  phone?: string | null     // to check airbnb's last-4 match
  name: string
  startsAt: string
  endsAt: string
}) {
  const seam = client()
  const supabase = _admin()
  const isAirbnb = opts.platform === 'airbnb'

  const { data: locks } = await supabase.from('property_locks')
    .select('seam_device_id, lock_name, airbnb_managed')
    .eq('property_id', opts.propertyId).eq('active', true)

  const results: any[] = []
  let mismatch: any = null

  for (const lock of locks || []) {
    // airbnb owns its unit door for airbnb bookings — don't program, but verify
    if (isAirbnb && lock.airbnb_managed) {
      const expected = (opts.phone || '').replace(/\D/g, '').slice(-4)
      try {
        const codes = await seam.accessCodes.list({ device_id: lock.seam_device_id })
        const hasExpected = expected && codes.some((c: any) => c.code === expected)
        if (expected && !hasExpected) {
          const actual = codes.map((c: any) => c.code).filter(Boolean)
          mismatch = { lock: lock.lock_name, expected, found_on_lock: actual, note: `Airbnb should have set ${expected} on ${lock.lock_name} but it isn't there` }
        }
        results.push({ lock: lock.lock_name, managed_by: 'airbnb', verified: !!hasExpected, expected })
      } catch (e: any) {
        results.push({ lock: lock.lock_name, managed_by: 'airbnb', ok: false, error: e?.message })
      }
      continue
    }

    // our lock — program the code
    try {
      const ac = await seam.accessCodes.create({
        device_id: lock.seam_device_id,
        name: opts.name,
        code: opts.code,
        starts_at: opts.startsAt,
        ends_at: opts.endsAt,
      })
      results.push({ lock: lock.lock_name, managed_by: 'us', ok: true, access_code_id: ac.access_code_id, status: ac.status })
    } catch (e: any) {
      results.push({ lock: lock.lock_name, managed_by: 'us', ok: false, error: e?.message })
    }
  }

  const failed = results.filter(r => r.managed_by === 'us' && !r.ok)
  return {
    code: opts.code,
    results,
    failed_count: failed.length,
    all_ok: failed.length === 0 && !mismatch,
    mismatch,
  }
}

// ── reprogram a booking's code window after an edit (dates or times changed) ──
// updates the existing code's starts_at/ends_at on all the booking's locks,
// rather than creating a duplicate. Uses the code stored on the booking.
export async function reprogramBookingWindow(opts: {
  propertyId: string
  code: string
  startsAt: string
  endsAt: string
  platform: string
}) {
  if (!opts.code) return { ok: true, updated: 0, attempted: 0, errors: 0, results: [] as any[], note: 'no code on booking — nothing to reprogram' }
  const seam = client()
  const supabase = _admin()
  const isAirbnb = opts.platform === 'airbnb'

  const { data: locks } = await supabase.from('property_locks')
    .select('seam_device_id, lock_name, airbnb_managed')
    .eq('property_id', opts.propertyId).eq('active', true)

  const results: any[] = []
  for (const lock of locks || []) {
    if (isAirbnb && lock.airbnb_managed) continue // airbnb owns it
    try {
      const codes = await seam.accessCodes.list({ device_id: lock.seam_device_id })
      const existing = codes.find((c: any) => c.code === opts.code)
      if (!existing) {
        // no code on this lock yet — create it fresh with the new window
        const ac = await seam.accessCodes.create({ device_id: lock.seam_device_id, name: `Reprogrammed · ${opts.code}`, code: opts.code, starts_at: opts.startsAt, ends_at: opts.endsAt })
        results.push({ lock: lock.lock_name, action: 'created', status: ac.status })
      } else {
        await seam.accessCodes.update({ access_code_id: existing.access_code_id, starts_at: opts.startsAt, ends_at: opts.endsAt })
        results.push({ lock: lock.lock_name, action: 'updated' })
      }
    } catch (e: any) {
      results.push({ lock: lock.lock_name, ok: false, error: e?.message })
    }
  }
  /*  `updated` COUNTED THE ARRAY, NOT THE SUCCESSES.
   *
   *  Every branch above pushes a row — created, updated, and failed alike — so
   *  `results.length` was the number of locks attempted. Three locks all failing
   *  returned `updated: 3`, and both callers (calendar/block and ical-sync)
   *  reported a window move that never happened. This is wrong whatever Seam is
   *  doing; the paused account only made it happen every time instead of rarely.
   *
   *  Nothing attempted is vacuously fine — a property whose only lock is
   *  airbnb-managed is `continue`d past above and has no work to fail at. */
  const errors = results.filter(r => r.ok === false).length
  const updated = results.filter(r => r.action === 'created' || r.action === 'updated').length
  return {
    ok: errors === 0,
    updated,
    attempted: results.length,
    errors,
    results,
    failedLocks: results.filter(r => r.ok === false).map(r => r.lock),
  }
}

// convert a booking's date + optional time field into an ISO timestamp
// timeStr like "4:00 PM" or "" → defaults to 4pm check-in / 11am checkout
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
  // build in Eastern time explicitly — don't rely on server local tz (Vercel is UTC)
  // EDT is UTC-4 (Mar–Nov), EST is UTC-5. Determine which applies for this date.
  const testDate = new Date(dateStr + 'T12:00:00Z')
  const jan = new Date(testDate.getFullYear(), 0, 1).getTimezoneOffset()
  const jul = new Date(testDate.getFullYear(), 6, 1).getTimezoneOffset()
  // Use Intl to get the actual Eastern offset for this date, robust to DST
  const easternOffsetHours = (() => {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', timeZoneName: 'shortOffset' })
    const part = fmt.formatToParts(new Date(dateStr + 'T12:00:00Z')).find(p => p.type === 'timeZoneName')
    const m = part?.value.match(/GMT([+-]\d+)/)
    return m ? parseInt(m[1]) : -4
  })()
  // local Eastern hour:min → UTC by subtracting the offset
  const utcHour = hour - easternOffsetHours
  const d = new Date(Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(5, 7)) - 1,
    parseInt(dateStr.slice(8, 10)),
    utcHour, min, 0, 0
  ))
  return d.toISOString()
}

// revoke a code from every lock on a property (used on cancellation)
/*  A REVOKE THAT DID NOT HAPPEN MUST NOT RETURN LIKE ONE THAT DID.
 *
 *  Every lock is tried inside its own try/catch, so this function never throws —
 *  which meant the caller's outer catch was dead code and a total failure came
 *  back as `{ revoked: 0, results: [ ...errors ] }`. bookings/cancel read that as
 *  success and wrote `lock.revoked — "Revoked code 5105"` into the system log.
 *  The log asserted a revoke that had not happened, which is worse than no log.
 *
 *  TWO ZEROES THAT MEAN OPPOSITE THINGS, and collapsing them is what would make
 *  the new alert useless. Nothing revoked because every lock errored is a
 *  failure. Nothing revoked because the code was already absent is the desired
 *  end state — the lock is clean. If both raised `lock.action_needed`, every
 *  already-tidy cancellation would cry wolf, and a red event that is usually
 *  wrong stops being read. So an untouched lock is recorded explicitly and the
 *  two cases are distinguishable in the return. */
export async function revokeCodeFromProperty(propertyId: string, code: string) {
  if (!code) return { ok: true, revoked: 0, checked: 0, errors: 0, nothingToRevoke: true, results: [] as any[], failedLocks: [] as string[] }
  const seam = client()
  const supabase = _admin()
  const { data: locks } = await supabase.from('property_locks')
    .select('seam_device_id, lock_name').eq('property_id', propertyId).eq('active', true)
  let revoked = 0
  const results: any[] = []
  for (const lock of locks || []) {
    try {
      const codes = await seam.accessCodes.list({ device_id: lock.seam_device_id })
      const match = codes.find((c: any) => c.code === code)
      if (match) {
        await seam.accessCodes.delete({ access_code_id: match.access_code_id })
        revoked++
        results.push({ lock: lock.lock_name, revoked: true })
      } else {
        // reached the lock, the code was not on it — clean, not failed
        results.push({ lock: lock.lock_name, revoked: false, not_found: true })
      }
    } catch (e: any) {
      results.push({ lock: lock.lock_name, error: e?.message })
    }
  }
  const errors = results.filter(r => r.error).length
  const checked = results.length - errors
  return {
    ok: errors === 0,
    revoked,
    checked,
    errors,
    nothingToRevoke: errors === 0 && revoked === 0,
    results,
    failedLocks: results.filter(r => r.error).map(r => r.lock),
  }
}
