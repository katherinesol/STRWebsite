import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission, getAuth } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'

/*  Handling a milestone. It records what Kaye DID — it does not do anything.
 *
 *  Two outcomes, and the difference is the point. `gift` says something was
 *  given and, in the note, what; `seen` says she looked and moved on. A plain
 *  dismissal would lose the first, and "who did we give what to" is exactly the
 *  question a loyalty flag exists to let her answer later.
 *
 *  Idempotent on (guest_id, stays): pressing it twice is not two gifts. */
const ALLOWED = ['guest_id', 'stays', 'outcome', 'note'] as const

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('guests', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to change guest records' }, { status: 403 })
  }
  const p = pick(await request.json().catch(() => null), ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })

  const { guest_id, stays, outcome, note } = p.fields
  if (!guest_id || !Number.isInteger(Number(stays))) {
    return NextResponse.json({ error: 'guest_id and stays are required' }, { status: 400 })
  }
  if (outcome && outcome !== 'seen' && outcome !== 'gift') {
    return NextResponse.json({ error: "outcome must be 'seen' or 'gift'" }, { status: 400 })
  }

  const who = await getAuth()
  const { error } = await createAdminClient().from('loyalty_acknowledgements').upsert({
    guest_id, stays: Number(stays), outcome: outcome || 'seen',
    note: note || null, acknowledged_by: who.ok ? who.userId : null,
    acknowledged_at: new Date().toISOString(),
  }, { onConflict: 'guest_id,stays' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Undo — the flag comes back. For a mis-click, or a gift that fell through. */
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('guests', 'edit')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const guest_id = searchParams.get('guest_id')
  const stays = Number(searchParams.get('stays'))
  if (!guest_id || !Number.isInteger(stays)) return NextResponse.json({ error: 'guest_id and stays required' }, { status: 400 })
  const { error } = await createAdminClient().from('loyalty_acknowledgements')
    .delete().eq('guest_id', guest_id).eq('stays', stays)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
