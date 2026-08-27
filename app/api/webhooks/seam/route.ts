import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Webhook } from 'svix'
import { logSystem } from '@/lib/system-log'

// Seam signs webhooks with svix. Verify before trusting anything.
export async function POST(request: NextRequest) {
  const secret = process.env.SEAM_WEBHOOK_SECRET
  const payload = await request.text()
  const headers = {
    'svix-id': request.headers.get('svix-id') || '',
    'svix-timestamp': request.headers.get('svix-timestamp') || '',
    'svix-signature': request.headers.get('svix-signature') || '',
  }

  let event: any
  try {
    if (secret) {
      const wh = new Webhook(secret)
      event = wh.verify(payload, headers)  // throws if signature invalid
    } else {
      event = JSON.parse(payload)  // no secret set yet — accept but log
    }
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // only act on a door being unlocked by a code
  if (event?.event_type !== 'lock.unlocked' || !event?.access_code_id) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const supabase = createAdminClient()
  const usedAt = event.occurred_at || event.created_at || new Date().toISOString()

  // find which booking owns this code. We stored door_code/lock_code, but the
  // event gives access_code_id; match by the CODE value via Seam is heavy, so
  // match on the code string we saved. The event carries `code`.
  const code = String(event.code || '').replace(/\D/g, '').slice(-4)
  if (!code) return NextResponse.json({ ok: true, no_code: true })

  // WHICH PROPERTY. This used to ask the device, with
  // `.eq('seam_device_id', …).limit(1).maybeSingle()`, and then filter candidate
  // bookings by whatever property came back. That is backwards for a shared door.
  // The front door of the Royal York house is ONE physical lock registered under
  // both royal-york-east and royal-york-west, so `limit(1)` returned an arbitrary
  // one of them — east, in practice — and every Royal York West guest was then
  // filtered out of their own entry. Observed live: "Royal Side opened with an
  // unknown code's code (6286)" while 6286 was the active RYW code.
  //
  // Two things went wrong, and the second is worse. Entries were misattributed.
  // And because checked_in_at is only written on a MATCHED booking, a guest whose
  // first entry was the shared door never got a check-in recorded at all.
  //
  // So the direction is inverted: the code identifies the guest, and the guest's
  // booking identifies the property. The device only narrows the candidates.
  const { data: deviceLocks } = await supabase.from('property_locks')
    .select('property_id, lock_name').eq('seam_device_id', event.device_id)
  const candidates = [...new Set((deviceLocks || []).map((l: any) => l.property_id).filter(Boolean))]

  // A shared door carries the same name under each property, so an unmatched
  // entry can still be named honestly. Only genuinely differing names fall back.
  const distinctNames = [...new Set((deviceLocks || []).map((l: any) => l.lock_name).filter(Boolean))]
  const fallbackLockName = distinctNames.length === 1 ? distinctNames[0] : 'a lock'

  const today = new Date().toISOString().split('T')[0]

  // Same predicate as the lock sweeps: a synced reservation has is_booking false
  // until someone enters its money. The sweep now programs codes for those rows,
  // so matching on is_booking alone would leave exactly those guests unattributed
  // — the fix to one sweep would be undone by the omission here.
  let platQ = supabase.from('calendar_blocks')
    .select('id, property_id, checked_in_at, door_code, start_date, end_date, guest_name')
    // a cancelled booking must not be credited with a door entry
    .neq('status', 'cancelled')
    .or('is_booking.eq.true,ical_uid.not.is.null')
    .lte('start_date', today).gte('end_date', today)
  if (candidates.length) platQ = platQ.in('property_id', candidates)
  const { data: plat } = await platQ

  // find the matching booking (platform first, then direct) to name the guest
  let matched: any = null, kind = ''
  for (const b of plat || []) {
    if (String(b.door_code || '').replace(/\D/g, '').slice(-4) === code) { matched = b; kind = 'platform'; break }
  }
  if (!matched) {
    let directQ = supabase.from('bookings')
      .select('id, property_id, checked_in_at, lock_code, check_in, check_out, guests:guest_id(name)')
      .lte('check_in', today).gte('check_out', today)
    if (candidates.length) directQ = directQ.in('property_id', candidates)
    const { data: direct } = await directQ
    for (const b of direct || []) {
      if (String(b.lock_code || '').replace(/\D/g, '').slice(-4) === code) { matched = b; kind = 'direct'; break }
    }
  }

  // The matched booking's property IS the property — derived, never picked. With
  // nothing matched there is no basis to claim one, so an ambiguous shared door
  // logs without a property rather than asserting the wrong one.
  const propertyId: string | null = matched?.property_id
    ?? (candidates.length === 1 ? (candidates[0] as string) : null)
  const lockName = (propertyId
    ? (deviceLocks || []).find((l: any) => l.property_id === propertyId)?.lock_name
    : null) || fallbackLockName

  const guestName = matched ? (matched.guest_name || (matched.guests && matched.guests.name) || 'Guest') : null

  // "opened with an unknown code's code" was the old unmatched string — the
  // placeholder was written where a NAME goes, so it read as a possessive.
  const summary = guestName
    ? `${lockName} opened with ${guestName}'s code (${code})`
    : `${lockName} opened with an unrecognised code (${code})`

  await logSystem('door.entry', summary,
    { code, lock: lockName, device_id: event.device_id, at: usedAt, shared_door: candidates.length > 1, matched: !!matched },
    propertyId || undefined)

  if (matched && !matched.checked_in_at) {
    const table = kind === 'platform' ? 'calendar_blocks' : 'bookings'
    await supabase.from(table).update({ checked_in_at: usedAt }).eq('id', matched.id)
    await logSystem('booking.checked_in', `${guestName} checked in at ${lockName}`, { code, at: usedAt }, propertyId || undefined)
    return NextResponse.json({ ok: true, checked_in: kind, id: matched.id, logged: true })
  }

  return NextResponse.json({ ok: true, logged: true, matched: !!matched })
}
