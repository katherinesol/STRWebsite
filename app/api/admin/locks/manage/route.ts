import { NextRequest, NextResponse } from 'next/server'
import { requireArea } from '@/lib/require-area'
import { createAdminClient } from '@/lib/supabase/server'
import { pick, rejection } from '@/lib/allowlist'

/*  The lock roster: read it, correct it, take one out of service.
 *
 *  THREE FIELDS ARE FROZEN WHILE WORK IS QUEUED, and this is the whole reason
 *  the route exists rather than a generic table editor. queue_lock_action
 *  DENORMALISES schlage_device_id onto the intent when it is recorded, and the
 *  worker groups pending rows by THAT copy — it never re-resolves through
 *  property_locks. Change the device id while an intent is waiting and the
 *  worker programs the old physical lock, or fails "device not found on the
 *  account", while this page shows the new one. The editor and the door would
 *  disagree and nothing would say so.
 *
 *  property_id is frozen for the same reason from the other end: it decides
 *  which bookings queue this lock at all. seam_device_id no longer drives any
 *  write — Seam is dead both directions — but it is still how an old row is
 *  recognised, so it is held to the same rule rather than quietly loosened.
 *
 *  THERE IS NO DELETE THAT WORKS, DELIBERATELY. lock_actions.lock_id is ON
 *  DELETE RESTRICT, so Postgres refuses a lock that any intent references —
 *  pending or historical. Before that constraint it CASCADED: deleting a lock
 *  silently deleted its pending intents, with no failed row, no alert and no
 *  gap in any list. The guests simply never got coded and the first symptom was
 *  somebody at a door. DELETE here exists to explain the refusal in words
 *  rather than let a Postgres error reach the screen.
 *
 *  DEACTIVATE IS THE REAL ANSWER. active=false drops the lock out of every
 *  future queueForBooking while leaving its history and its pending work
 *  intact, and it is reversible. A lock is taken off a door far more often than
 *  it is expunged from the record. */

const EDITABLE = ['lock_name', 'code_length', 'active', 'airbnb_managed'] as const
const FROZEN_WHILE_QUEUED = ['schlage_device_id', 'seam_device_id', 'property_id'] as const
const ALLOWED = [...EDITABLE, ...FROZEN_WHILE_QUEUED] as const

/** Pending intents for a lock, and every intent that references it. The first
 *  decides whether a field may be edited; the second is why a delete is refused. */
async function intentCounts(supabase: any, lockId: string) {
  const { data } = await supabase.from('lock_actions').select('status').eq('lock_id', lockId)
  const rows = data || []
  return {
    pending: rows.filter((r: any) => r.status === 'pending' || r.status === 'claimed').length,
    total: rows.length,
  }
}

export async function GET() {
  const no = await requireArea('locks', 'view')
  if (no) return no

  const supabase = createAdminClient()
  const [{ data: locks }, { data: actions }] = await Promise.all([
    supabase.from('property_locks').select('*').order('property_id').order('lock_name'),
    supabase.from('lock_actions').select('lock_id, status'),
  ])

  const byLock: Record<string, { pending: number; total: number }> = {}
  for (const a of actions || []) {
    byLock[a.lock_id] ||= { pending: 0, total: 0 }
    byLock[a.lock_id].total++
    if (a.status === 'pending' || a.status === 'claimed') byLock[a.lock_id].pending++
  }

  /*  Which rows share a physical device. Royal Side is ONE lock with a row
      under royal-york-east and another under royal-york-west, because East and
      West share that side entrance — and the worker serialises on the device
      for exactly that reason. Editing one row of a pair without being told is
      how the two silently stop describing the same door. */
  const rowsPerDevice: Record<string, number> = {}
  for (const l of locks || []) rowsPerDevice[l.schlage_device_id] = (rowsPerDevice[l.schlage_device_id] || 0) + 1

  return NextResponse.json({
    locks: (locks || []).map(l => {
      const c = byLock[l.id] || { pending: 0, total: 0 }
      const shared = rowsPerDevice[l.schlage_device_id] > 1
      return {
        ...l,
        pending_intents: c.pending,
        total_intents: c.total,
        shares_device_with: shared
          ? (locks || []).filter(o => o.schlage_device_id === l.schlage_device_id && o.id !== l.id)
              .map(o => ({ lock_name: o.lock_name, property_id: o.property_id }))
          : [],
        // what the editor must grey out, decided here rather than in the page
        frozen_fields: c.pending > 0 ? [...FROZEN_WHILE_QUEUED] : [],
        deletable: c.total === 0,
      }
    }),
  })
}

export async function PATCH(request: NextRequest) {
  const no = await requireArea('locks', 'edit', ['owner'])
  if (no) return no

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const p = pick(await request.json().catch(() => null), ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })
  const patch = p.fields
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: lock } = await supabase.from('property_locks').select('*').eq('id', id).maybeSingle()
  if (!lock) return NextResponse.json({ error: 'No such lock' }, { status: 404 })

  const { pending } = await intentCounts(supabase, id)
  const touchingFrozen = FROZEN_WHILE_QUEUED.filter(f => f in patch && patch[f] !== (lock as any)[f])
  if (pending > 0 && touchingFrozen.length) {
    /*  Refused, not queued-and-applied-later. The pending rows carry the OLD
        device id; letting the edit land would leave the worker acting on one
        lock while this page describes another, which is the desync the freeze
        exists to prevent. */
    return NextResponse.json({
      error: `${lock.lock_name} has ${pending} intent(s) still waiting, so ${touchingFrozen.join(', ')} cannot change yet — `
        + `the queue recorded the current device id and the worker acts on that copy. `
        + `Let the queue drain, then edit.`,
      frozen: touchingFrozen, pending_intents: pending,
    }, { status: 409 })
  }

  const { error } = await supabase.from('property_locks').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true, changed: Object.keys(patch),
    /*  Said back rather than assumed read: airbnb_managed decides who codes a
        door, and it was wrong on two locks until evidence corrected it in
        August — Airbnb's fingerprint was on Port Colborne, flagged false, and
        absent from Royal York Apt 1, flagged true. */
    note: 'airbnb_managed' in patch
      ? `${lock.lock_name} is now ${patch.airbnb_managed ? 'coded by Airbnb' : 'coded by us'} for Airbnb stays.`
      : undefined,
  })
}

export async function DELETE(request: NextRequest) {
  const no = await requireArea('locks', 'edit', ['owner'])
  if (no) return no

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: lock } = await supabase.from('property_locks').select('lock_name, active').eq('id', id).maybeSingle()
  if (!lock) return NextResponse.json({ error: 'No such lock' }, { status: 404 })

  const { pending, total } = await intentCounts(supabase, id)
  if (total > 0) {
    /*  The database would refuse this anyway — ON DELETE RESTRICT. This says
        why in words, so the answer is a sentence rather than a constraint name,
        and names the pending ones separately because those are the ones that
        would have gone silently under the old CASCADE. */
    return NextResponse.json({
      error: `${lock.lock_name} has ${total} recorded action(s)`
        + (pending ? `, ${pending} of them still waiting to reach the door` : '')
        + `. Deleting it would take that history with it, so it is refused. `
        + `Deactivate it instead — it drops out of every future booking, keeps the record, and can be undone.`,
      pending_intents: pending, total_intents: total, suggestion: 'deactivate',
    }, { status: 409 })
  }

  const { error } = await supabase.from('property_locks').delete().eq('id', id)
  // belt and braces: if the constraint fires anyway, it must not read like a crash
  if (error) return NextResponse.json({ error: `Could not delete ${lock.lock_name}: ${error.message}` }, { status: 409 })
  return NextResponse.json({ ok: true, deleted: lock.lock_name })
}
