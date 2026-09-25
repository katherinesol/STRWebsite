import { NextResponse } from 'next/server'
import { requireArea } from '@/lib/require-area'
import { createAdminClient } from '@/lib/supabase/server'

/*  Is the worker alive, and is the queue moving.
 *
 *  THIS IS THE POSTMORTEM OF A FOURTEEN-DAY STALL. On 10 September the Schlage
 *  password stored in the Keychain stopped working. Every phase of the worker
 *  runs after that login, so it was not a degraded run — it was no run at all.
 *  Twelve intents piled up, two of them for a stay that had already happened,
 *  and one guest's code was never programmed. Nothing anywhere said so. It was
 *  found by hand, by noticing that lock_actions.done_at had not moved.
 *
 *  DOOR EVENTS ARE NOT A HEARTBEAT, and believing they were is what hid this.
 *  door.entry rows kept arriving daily throughout the stall — 278 of them —
 *  because the Seam webhook writes them too. Only the worker stamps
 *  detail.source = 'worker', and those stop dead on 10 September. Every query
 *  below that claims to describe the worker filters on that field.
 *
 *  LAST SUCCESSFUL DRAIN, NOT LAST ACTIVITY. The two diverged by a fortnight
 *  and the gap between them WAS the bug. max(done_at) is the only figure that
 *  cannot be satisfied by the worker merely starting.
 *
 *  A PENDING INTENT WHOSE STAY HAS BEGUN is the alarm worth waking for: it
 *  means somebody may be standing at a door their code was never put on. It is
 *  reported separately from ordinary depth, which is often just the one-write-
 *  per-device pacing doing its job. */

export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await requireArea('locks', 'view')
  if (no) return no

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: actions }, { data: auth }, { data: workerEvents }, { data: locks }] = await Promise.all([
    supabase.from('lock_actions')
      .select('id, status, action, code, booking_id, booking_kind, lock_id, schlage_device_id, attempts, last_error, created_at, claimed_at, done_at, starts_at, ends_at'),
    // the record the worker now writes on every sign-in, success or failure
    supabase.from('system_log').select('summary, detail, created_at')
      .eq('event_type', 'lock.auth').order('created_at', { ascending: false }).limit(1),
    supabase.from('system_log').select('created_at')
      .eq('detail->>source', 'worker').order('created_at', { ascending: false }).limit(1),
    supabase.from('property_locks').select('id, lock_name, property_id, schlage_device_id').eq('active', true),
  ])

  const all = actions || []
  const lockById: Record<string, any> = {}
  for (const l of locks || []) lockById[l.id] = l

  const pending = all.filter(a => a.status === 'pending')
  const claimed = all.filter(a => a.status === 'claimed')
  const done = all.filter(a => a.status === 'done' && a.done_at)
  const lastDrain = done.length ? done.map(a => a.done_at).sort().slice(-1)[0] : null

  /*  Which stay each pending intent belongs to, so "started already" is a fact
      rather than a guess. Two tables because a booking is either kind. */
  const platIds = pending.filter(a => a.booking_kind === 'platform').map(a => a.booking_id)
  const dirIds = pending.filter(a => a.booking_kind === 'direct').map(a => a.booking_id)
  const [{ data: plat }, { data: dir }] = await Promise.all([
    platIds.length ? supabase.from('calendar_blocks').select('id, start_date, guest_name, property_id').in('id', platIds) : Promise.resolve({ data: [] as any[] }),
    dirIds.length ? supabase.from('bookings').select('id, check_in, property_id, guests:guest_id(name)').in('id', dirIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const stay: Record<string, { start: string; who: string }> = {}
  for (const b of plat || []) stay[b.id] = { start: b.start_date, who: b.guest_name || '(no name)' }
  for (const b of dir || []) stay[b.id] = { start: b.check_in, who: (b.guests as any)?.name || '(no name)' }

  const waiting = pending.map(a => {
    const s = stay[a.booking_id]
    return {
      id: a.id, action: a.action, code: a.code, attempts: a.attempts, last_error: a.last_error,
      lock: lockById[a.lock_id]?.lock_name || a.schlage_device_id?.slice(0, 8) || '?',
      queued: a.created_at, stay_start: s?.start || null, who: s?.who || '(unknown stay)',
      /*  The one that matters. Not "old" — old is fine when the stay is in
          December. Started is not fine at any age. */
      stay_started: !!s?.start && s.start <= today,
      age_days: Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000),
    }
  }).sort((a, b) => (a.stay_start || '9999').localeCompare(b.stay_start || '9999'))

  // depth per physical device, because that is what the one-write-per-run paces
  const perDevice: Record<string, { lock: string; pending: number }> = {}
  for (const a of pending) {
    const k = a.schlage_device_id || 'unknown'
    perDevice[k] ||= { lock: lockById[a.lock_id]?.lock_name || k.slice(0, 8), pending: 0 }
    perDevice[k].pending++
  }

  const a0: any = (auth || [])[0]
  const authOk = a0 ? a0.detail?.ok !== false : null
  const lastWorker = (workerEvents || [])[0]?.created_at || null
  const hoursSince = (t: string | null) => t ? (Date.now() - new Date(t).getTime()) / 3600000 : null
  const drainAge = hoursSince(lastDrain)

  /*  A claim with no finish is a trap: phase_drain selects status=pending only,
      so nothing ever reclaims it. Minutes old is the worker mid-write on a slow
      lock and entirely normal; hours old means a run died holding it. */
  const stranded = claimed.filter(a => (hoursSince(a.claimed_at) || 0) > 2)

  const alarms: string[] = []
  if (authOk === false) alarms.push(
    a0?.detail?.stage === 'version'
      ? `${a0.summary}. Nothing is being programmed until it is copied over.`
      : `The worker cannot sign in to Schlage — ${a0?.detail?.error || 'no reason recorded'}. No phase runs, so nothing is being programmed.`)
  if (authOk === null) alarms.push('No sign-in has ever been recorded. Update the worker on this machine so it starts writing one.')
  if (waiting.some(w => w.stay_started)) alarms.push(`${waiting.filter(w => w.stay_started).length} intent(s) are waiting for a stay that has already started — someone may be at a door their code was never put on.`)
  if (drainAge !== null && drainAge > 48 && pending.length) alarms.push(`Nothing has drained in ${Math.floor(drainAge / 24)} days while ${pending.length} intent(s) wait.`)
  if (stranded.length) alarms.push(`${stranded.length} intent(s) stuck in 'claimed' — a run died holding them and nothing reclaims a claimed row.`)

  return NextResponse.json({
    ok: alarms.length === 0,
    alarms,
    worker: {
      last_sign_in: a0?.created_at || null,
      sign_in_ok: authOk,
      // 'signin' or 'version' — a drifted copy refuses before it ever logs in
      stage: a0?.detail?.stage || null,
      sign_in_detail: a0?.summary || null,
      // NOT a heartbeat on its own — see the note above. Reported for context only.
      last_worker_event: lastWorker,
    },
    queue: {
      last_successful_drain: lastDrain,
      hours_since_drain: drainAge === null ? null : Math.round(drainAge),
      pending: pending.length,
      claimed: claimed.length,
      stranded_claims: stranded.length,
      failed: all.filter(a => a.status === 'failed').length,
      done: done.length,
      per_device: Object.values(perDevice),
      oldest_pending: waiting.length ? waiting.reduce((o, w) => w.age_days > o.age_days ? w : o) : null,
    },
    waiting,
  })
}
