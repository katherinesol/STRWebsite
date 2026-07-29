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
