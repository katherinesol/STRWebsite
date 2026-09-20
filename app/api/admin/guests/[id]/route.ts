import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'


/* Guest records are the most personal table here — names, email addresses,
 * phone numbers and free-text notes. Every route on it was isAuthed(), so any
 * signed-in account could pull the whole list. Same hole as the booking PATCH,
 * closed the same way. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('guests', 'edit')) return NextResponse.json({ error: 'Not allowed to change guest records' }, { status: 403 })
  const { id } = await params

  /*  THERE WAS NO ALLOWLIST HERE. The body was spread straight into the update,
   *  so a caller could set `id` and move the record, rewrite `referral_code`, or
   *  flip `returning_guest` — the same shape lib/allowlist.ts was written for on
   *  six other routes, missed on this one.
   *
   *  returning_guest is NOT writable and never will be: it is the flag that is
   *  true on ten rows while one guest has actually returned, which is why the
   *  count is derived. prior_stays IS writable — it is the only part of the
   *  count the system cannot see for itself. */
  const ALLOWED = [
    'name', 'first_name', 'last_name', 'email', 'phone', 'notes', 'id_verified',
    'locked_rate_enabled', 'locked_rate_royal_york', 'locked_rate_nickel_beach',
    'prior_stays',
  ] as const

  const p = pick(await request.json(), ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })

  const supabase = createAdminClient()
  const cleaned: Record<string, any> = { ...p.fields }

  if ('prior_stays' in cleaned) {
    const n = Number(cleaned.prior_stays)
    if (!Number.isFinite(n) || n < 0 || n > 200 || !Number.isInteger(n)) {
      return NextResponse.json({ error: 'Earlier stays must be a whole number between 0 and 200.' }, { status: 400 })
    }
    cleaned.prior_stays = n
  }

  for (const key of ['locked_rate_royal_york', 'locked_rate_nickel_beach']) {
    if (cleaned[key] === '' || cleaned[key] === null) cleaned[key] = null
    else if (cleaned[key] !== undefined) cleaned[key] = parseFloat(cleaned[key])
  }
  if (cleaned.phone === '') cleaned.phone = null

  const { data: existingGuest } = await supabase.from('guests').select('name').eq('id', id).single()
  const { error } = await supabase.from('guests').update(cleaned).eq('id', id)
  if (error) { console.error('Guest PATCH error:', error.message); return NextResponse.json({ error: error.message }, { status: 500 }) }

  // cascade name change ONLY to blocks already linked by guest_id
  if (cleaned.name && cleaned.name !== existingGuest?.name) {
    await supabase.from('calendar_blocks')
      .update({ guest_name: cleaned.name })
      .eq('guest_id', id)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('guests', 'edit')) return NextResponse.json({ error: 'Not allowed to delete guest records' }, { status: 403 })
  const { id } = await params
  const supabase = createAdminClient()
  // nullify guest_id on bookings to preserve history
  await supabase.from('bookings').update({ guest_id: null }).eq('guest_id', id)
  const { error } = await supabase.from('guests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
