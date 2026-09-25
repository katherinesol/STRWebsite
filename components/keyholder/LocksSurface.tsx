'use client'
import { useCallback, useEffect, useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'
import LockHeartbeat from '@/components/admin/LockHeartbeat'

/*  Doors, from the queue rather than from a lock vendor.
 *
 *  FOUR THINGS, IN THE ORDER THEY GO WRONG. Whether the machine is running
 *  (heartbeat, above) — then which arrivals still need a code, then what is
 *  queued and not yet on a door, then the locks themselves. The stall of 10-24
 *  September was invisible because every screen described bookings and none
 *  described the machine that serves them.
 *
 *  SET ENQUEUES. It does not program. The server has no Schlage credentials and
 *  never will; the worker on the owner's Mac does the writing. Every label here
 *  says "queued" and never "programmed", because the page that said programmed
 *  while writing nothing is the reason this one exists. */

type Door = { lock: string; code: string | null; status: string; source?: string; scheduled?: boolean; errored?: boolean; queue?: any }
type Row = { id: string; kind: 'direct' | 'platform'; guest: string; property: string; platform: string; start: string; code: string | null; doors: Door[]; needs_attention: boolean }
type Lock = {
  id: string; lock_name: string; property_id: string; schlage_device_id: string; seam_device_id: string
  active: boolean; airbnb_managed: boolean; code_length: number
  pending_intents: number; total_intents: number; deletable: boolean
  frozen_fields: string[]; shares_device_with: { lock_name: string; property_id: string }[]
  battery_level: number | null; battery_checked_at: string | null
}

const PROP: Record<string, string> = {
  'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach',
}
const chipFor = (d: Door) => {
  const viaQueue = d.source === 'queue'
  if (d.errored || d.status === 'failed') return { bg: L.redWash, fg: L.red, label: d.status === 'failed' ? 'worker failed' : 'error' }
  if (d.status === 'unknown') return { bg: L.cardAlt, fg: L.inkFaint, label: 'unknown' }
  if (d.status === 'set' || d.status === 'programmed') return { bg: L.cardAlt, fg: L.green, label: viaQueue ? 'worker programmed' : 'on the lock' }
  if (d.status === 'queued') return { bg: L.cardAlt, fg: L.inkMuted, label: 'queued · not on the lock yet' }
  if (d.status === 'in progress') return { bg: L.cardAlt, fg: L.inkMuted, label: 'worker running…' }
  if (d.status === 'missing') return { bg: L.amberWash, fg: L.amber, label: 'missing' }
  return { bg: L.cardAlt, fg: L.inkFaint, label: d.status || '—' }
}
const btn = (primary = false): React.CSSProperties => ({
  padding: '7px 12px', borderRadius: '8px', fontSize: '12.5px', cursor: 'pointer',
  border: primary ? 'none' : `1px solid ${L.line}`,
  background: primary ? L.ink : 'transparent', color: primary ? L.card : L.inkFaint,
})

export default function LocksSurface({ canOperate }: { canOperate: boolean }) {
  const [sweep, setSweep] = useState<any>(null)
  const [locks, setLocks] = useState<Lock[]>([])
  const [loading, setLoading] = useState(true)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, l] = await Promise.all([
        fetch('/api/admin/locks/sweep').then(r => r.json()),
        fetch('/api/admin/locks/manage').then(r => r.json()),
      ])
      setSweep(s.error ? null : s)
      setLocks(l.locks || [])
      setErr(s.error || l.error || '')
    } catch { setErr('Could not read the locks') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function setCode(b: Row) {
    const code = (codes[b.id] || '').trim()
    if (!/^\d{4}$/.test(code)) { setMsg(m => ({ ...m, [b.id]: 'Four digits' })); return }
    setBusy(b.id); setMsg(m => ({ ...m, [b.id]: '' }))
    const r = await fetch('/api/admin/locks/set-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: b.id, kind: b.kind, code }),
    }).then(x => x.json()).catch(() => ({ error: 'the request failed' }))
    setBusy('')
    // "queued", never "programmed" — the worker is what reaches the door
    setMsg(m => ({ ...m, [b.id]: r.error ? r.error
      : r.state === 'recorded' ? 'saved — Airbnb programs these doors'
      : `queued on ${r.locks_queued} door(s) — the worker sets it` }))
    if (!r.error) setTimeout(load, 1200)
  }

  async function patchLock(id: string, patch: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    setBusy(id)
    const r = await fetch(`/api/admin/locks/manage?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).then(x => x.json()).catch(() => ({ error: 'the request failed' }))
    setBusy('')
    if (r.error) { setErr(r.error); return }
    setErr(''); load()
  }

  const rows: Row[] = sweep?.bookings || []
  const attention = rows.filter(r => r.needs_attention)
  const rest = rows.filter(r => !r.needs_attention)

  const Stay = ({ b }: { b: Row }) => (
    <div style={{ padding: '14px 20px', borderTop: `1px solid ${L.lineSoft || L.line}`, display: 'grid', gridTemplateColumns: '1.3fr 1.4fr auto', gap: '14px', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: '13.5px', color: L.ink }}>{b.guest || 'Guest'}</div>
        <div style={{ fontSize: '11.5px', color: L.inkFaint }}>{PROP[b.property] || b.property} · {b.platform} · {b.start}</div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {b.doors.map((d, i) => {
          const c = chipFor(d)
          return (
            <span key={i} title={d.queue?.last_error || undefined}
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: c.bg, color: c.fg }}>
              {d.lock}: {d.code || '—'} · {c.label}
            </span>
          )
        })}
        {!b.doors.length && <span style={{ fontSize: '11.5px', color: L.inkFaint }}>Airbnb codes every door here</span>}
      </div>
      <div style={{ textAlign: 'right' }}>
        {canOperate ? (
          <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end', alignItems: 'center' }}>
            <input value={codes[b.id] ?? (b.code || '')} maxLength={4} placeholder="0000"
              onChange={e => setCodes(s => ({ ...s, [b.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              style={{ width: '62px', padding: '6px 8px', borderRadius: '7px', border: `1px solid ${L.line}`, background: L.card, color: L.ink, fontFamily: F.mono, fontSize: '13px', textAlign: 'center' }} />
            <button onClick={() => setCode(b)} disabled={busy === b.id} style={btn(true)}>{busy === b.id ? '…' : 'Queue'}</button>
          </div>
        ) : <span style={{ fontFamily: F.mono, fontSize: '14px', color: L.ink }}>{b.code || '—'}</span>}
        {msg[b.id] && <div style={{ fontSize: '11px', color: msg[b.id].startsWith('queued') || msg[b.id].startsWith('saved') ? L.green : L.red, marginTop: '4px' }}>{msg[b.id]}</div>}
      </div>
    </div>
  )

  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Locks</span>
        <p style={{ fontSize: '13px', color: L.inkMuted, margin: '8px 0 0', maxWidth: '640px', lineHeight: 1.6 }}>
          Setting a code records an intent. The worker on the Mac is what reaches the door, so a code is
          <em> queued</em> until it says otherwise — nothing on this page writes to a lock.
        </p>
      </div>

      <LockHeartbeat />

      {err && <div style={{ ...cardStyle, padding: '12px 16px', fontSize: '12.5px', color: L.red, borderColor: L.redLine }}>{err}</div>}
      {loading && <div style={{ fontSize: '13px', color: L.inkFaint }}>Reading the queue…</div>}

      {attention.length > 0 && (
        <div style={{ ...cardStyle, overflow: 'hidden', borderColor: L.amberLine }}>
          <div style={{ ...microLabel, padding: '11px 20px', background: L.amberWash, color: L.amber }}>Needs attention · {attention.length}</div>
          {attention.map(b => <Stay key={b.id} b={b} />)}
        </div>
      )}

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ ...microLabel, padding: '11px 20px', background: L.cardAlt }}>Upcoming · {rest.length}</div>
        {rest.map(b => <Stay key={b.id} b={b} />)}
        {!loading && !rest.length && <div style={{ padding: '16px 20px', fontSize: '13px', color: L.inkFaint }}>Nothing upcoming.</div>}
      </div>

      {/* the roster */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ ...microLabel, padding: '11px 20px', background: L.cardAlt }}>The locks · {locks.length}</div>
        {locks.map(l => {
          const frozen = l.frozen_fields.length > 0
          return (
            <div key={l.id} style={{ padding: '14px 20px', borderTop: `1px solid ${L.lineSoft || L.line}`, opacity: l.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', color: L.ink }}>{l.lock_name}</span>
                <span style={{ fontSize: '12px', color: L.inkFaint }}>{PROP[l.property_id] || l.property_id}</span>
                {!l.active && <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: L.cardAlt, color: L.inkFaint }}>out of service</span>}
                {l.airbnb_managed && <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: L.amberWash, color: L.amber }}>Airbnb codes it</span>}
                {l.battery_level !== null && (
                  <span style={{ fontSize: '11.5px', fontFamily: F.mono, color: l.battery_level <= 25 ? L.red : l.battery_level <= 40 ? L.amber : L.green }}>
                    {l.battery_level}%
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: L.inkFaint }}>
                  {l.pending_intents ? `${l.pending_intents} queued · ` : ''}{l.total_intents} recorded
                </span>
              </div>

              {/*  One physical lock, two rows — East and West share the side
                   entrance, and the worker serialises on the device because of
                   it. Editing one row without knowing about the other is how
                   they stop describing the same door. */}
              {l.shares_device_with.length > 0 && (
                <div style={{ fontSize: '11.5px', color: L.amber, marginTop: '5px' }}>
                  Same physical lock as {l.shares_device_with.map(s => `${s.lock_name} (${PROP[s.property_id] || s.property_id})`).join(', ')} — one device, one battery, one set of codes.
                </div>
              )}

              {frozen && (
                <div style={{ fontSize: '11.5px', color: L.inkMuted, marginTop: '5px' }}>
                  Device and property are locked while {l.pending_intents} intent(s) wait: the queue recorded the current
                  device id and the worker acts on that copy.
                </div>
              )}

              {canOperate && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '9px', flexWrap: 'wrap' }}>
                  <button onClick={() => patchLock(l.id, { active: !l.active })} disabled={busy === l.id} style={btn()}>
                    {l.active ? 'Take out of service' : 'Put back in service'}
                  </button>
                  <button onClick={() => patchLock(l.id, { airbnb_managed: !l.airbnb_managed },
                    `${l.lock_name}: ${l.airbnb_managed
                      ? 'we will start programming this door for Airbnb stays.'
                      : 'Airbnb will be assumed to program this door, and we will stop.'}\n\nThis decides who codes the door. It was wrong on two locks until August, and guests arrived without codes. Continue?`)}
                    disabled={busy === l.id} style={btn()}>
                    {l.airbnb_managed ? 'We code this door' : 'Airbnb codes this door'}
                  </button>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: L.inkFaint, alignSelf: 'center' }}>
                    {l.deletable ? 'no history — may be deleted' : 'has history — deactivate, not delete'}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
