import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, getAuth } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'

/*  Katherine approving or denying a guest's request for the exact address.
 *
 *  Owner and co-owner only. This is the decision to tell someone where the house
 *  is before the automatic reveal, which is not a permission to hand to a cleaner
 *  or a co-host by default.
 *
 *  A DENIAL IS NOT PERMANENT AND IS NOT MEANT TO BE. At 24 hours before check-in
 *  the address appears regardless — see lib/address-visibility.ts. Denying says
 *  "not yet", not "never", and the guest is never shown the word. */

const ALLOWED = ['booking_id', 'booking_kind', 'decision', 'note'] as const

export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  const p = pick(await request.json().catch(() => ({})), ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })

  const { booking_id, booking_kind, decision, note } = p.fields
  if (!booking_id || !booking_kind) {
    return NextResponse.json({ error: 'booking_id and booking_kind required' }, { status: 400 })
  }
  if (decision !== 'approved' && decision !== 'denied') {
    return NextResponse.json({ error: "decision must be 'approved' or 'denied'" }, { status: 400 })
  }

  const who = await getAuth()
  const { data, error } = await createAdminClient()
    .from('address_requests')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: who.ok ? who.userId : null,
      note: note ? String(note).slice(0, 500) : null,
    })
    .eq('booking_id', booking_id)
    .eq('booking_kind', booking_kind)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'No such request' }, { status: 404 })

  return NextResponse.json({ ok: true, status: data[0].status })
}
