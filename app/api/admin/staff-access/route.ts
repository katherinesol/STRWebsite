import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { lockActionNeeded } from '@/lib/lock-alert'
import { logSystem } from '@/lib/system-log'

export async function GET() {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('staff_access').select('*').eq('active', true).order('created_at', { ascending: false })
  return NextResponse.json({ grants: data || [] })
}

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { person_name, role, code, access_type, starts_at, ends_at, lock_ids } = await request.json()
  if (!person_name || !code || !Array.isArray(lock_ids) || !lock_ids.length) return NextResponse.json({ error: 'Name, code, and at least one door required' }, { status: 400 })
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: 'Code must be 4 digits' }, { status: 400 })
  if (access_type === 'fixed' && (!starts_at || !ends_at)) return NextResponse.json({ error: 'Fixed access needs a start and end' }, { status: 400 })

  /*  STAFF GRANTS DO NOT FIT lock_actions, and pretending otherwise would be
   *  worse than saying so. Every row in that queue is parented to a booking —
   *  booking_id is NOT NULL — because a door code for a guest has a stay, a
   *  window and an end. A cleaner's code has none of those: it is ongoing until
   *  revoked, belongs to a person rather than a reservation, and is chosen by
   *  hand rather than derived from a phone number.
   *
   *  So this records the grant and tells you to program it, rather than calling
   *  a Seam API that has not worked in weeks. What was here before created the
   *  code, caught every failure per-lock, and returned ok:true with the failures
   *  buried in a results array nothing rendered — so a contractor could be given
   *  access that existed only in the database. The DELETE below was worse still:
   *  a bare catch {} around the revoke, so a dismissed contractor's code stayed
   *  live on the door and the UI reported success.
   *
   *  Staff access needs its own queue shape (person-parented, no window,
   *  ongoing). Until it has one, this is honest instead of silent. */
  const supabase = createAdminClient()
  const { data: locks } = await supabase.from('property_locks')
    .select('seam_device_id, lock_name, schlage_device_id').in('seam_device_id', lock_ids)

  const { data: grant } = await supabase.from('staff_access').insert({
    person_name, role: role || null, code, access_type: access_type || 'ongoing',
    starts_at: access_type === 'fixed' ? starts_at : null,
    ends_at: access_type === 'fixed' ? ends_at : null,
    lock_ids, seam_code_ids: [],
  }).select('id').single()

  const lockNames = (locks || []).map((l: any) => l.lock_name)
  await lockActionNeeded({
    intent: 'program',
    propertyId: (locks || [])[0] ? 'staff-access' : 'staff-access',
    code, locks: lockNames,
    who: `${person_name}${role ? ' · ' + role : ''} (staff access)`,
    window: access_type === 'fixed' ? { startsAt: starts_at, endsAt: ends_at } : null,
    error: 'staff grants are not yet queued — program this code by hand',
  })

  return NextResponse.json({
    ok: true, grant_id: grant?.id,
    programmed: false,
    action_needed: `Grant recorded. Put code ${code} on ${lockNames.join(', ') || 'the locks'} by hand — staff access is not yet on the worker queue.`,
    locks: lockNames,
  })
}

// revoke — delete the codes from the locks and deactivate the grant
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await request.json()
  const supabase = createAdminClient()
  const { data: grant } = await supabase.from('staff_access')
    .select('person_name, code, lock_ids').eq('id', id).single()
  await supabase.from('staff_access').update({ active: false }).eq('id', id)

  /*  A REVOKED STAFF CODE IS STILL ON THE DOOR. The old bare catch {} meant a
      dismissed contractor's code survived and this returned ok. It says so now. */
  await lockActionNeeded({
    intent: 'revoke',
    propertyId: 'staff-access',
    code: grant?.code || null,
    who: `${grant?.person_name || 'someone'} (staff access revoked)`,
    error: 'staff grants are not yet queued — remove this code by hand',
  })
  await logSystem('lock.revoke_failed',
    `Staff access for ${grant?.person_name || id} marked inactive, but code ${grant?.code || '?'} is STILL ON THE LOCKS. Remove it by hand.`,
    { grant_id: id, code: grant?.code, lock_ids: grant?.lock_ids })

  return NextResponse.json({
    ok: true, removed_from_locks: false,
    action_needed: `Code ${grant?.code || '?'} is still on the locks — remove it by hand.`,
  })
}
