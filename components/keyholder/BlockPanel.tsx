'use client'
import { useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

// Holding dates so they cannot be booked.
//
// Nothing is written until the confirm. The panel asks the server for conflicts
// first, and a conflict is NAMED — "Diana Balthasar · 2026-08-22 → 2026-08-24
// (airbnb)" rather than "those dates overlap". Only after seeing that can the
// owner press "Block anyway", which is the single place `force` is ever sent.

const PROPERTIES = [
  { id: 'nickel-beach', name: 'Nickel Beach' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'royal-york-east', name: 'Royal York East' },
]
const REASONS: [string, string][] = [
  ['owner', 'Owner stay'], ['cleaning', 'Cleaning'], ['maintenance', 'Maintenance'], ['manual', 'Manual'],
]
const NAME: Record<string, string> = Object.fromEntries(PROPERTIES.map(p => [p.id, p.name]))

const nights = (a: string, b: string) =>
  Math.max(0, Math.round((+new Date(b + 'T00:00:00Z') - +new Date(a + 'T00:00:00Z')) / 86400000))

export default function BlockPanel({ property, onClose, onDone }: {
  property: string; onClose: () => void; onDone: () => void
}) {
  const [prop, setProp] = useState(property)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('owner')
  const [blockFor, setBlockFor] = useState('myself')
  const [forName, setForName] = useState('')
  const [notes, setNotes] = useState('')
  const [conflicts, setConflicts] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const n = from && to ? nights(from, to) : 0
  const valid = !!prop && !!from && !!to && n > 0

  const payload = () => ({
    property_id: prop, start_date: from, end_date: to, reason,
    ...(reason === 'owner' ? { block_for: blockFor, block_for_name: blockFor === 'friends-family' ? forName : null } : {}),
    notes: notes || null,
  })

  async function post(extra: any) {
    const res = await fetch('/api/admin/calendar/block', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload(), ...extra }),
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  /** read-only: ask what is already on those dates */
  async function check() {
    setBusy(true); setErr('')
    try {
      const r = await post({ check: true })
      if (!r.body.ok) { setErr(r.body.error || 'Could not check those dates'); return }
      setConflicts(r.body.conflicts || [])
    } catch { setErr('Could not reach the server — nothing was changed.') }
    finally { setBusy(false) }
  }

  /** the only caller that ever sends force, and only from the second button */
  async function commit(force: boolean) {
    setBusy(true); setErr('')
    try {
      const r = await post(force ? { force: true } : {})
      if (r.status === 409) { setConflicts(r.body.conflicts || []); setErr(r.body.error || 'Those dates are already taken.'); return }
      if (!r.body.ok) { setErr(r.body.error || 'Could not block those dates'); return }
      onDone()
    } catch { setErr('Could not reach the server — nothing was changed.') }
    finally { setBusy(false) }
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: '99px', fontSize: '13px', fontFamily: F.sans, cursor: 'pointer',
    border: `1px solid ${on ? L.ink : 'oklch(0.89 0.005 80)'}`,
    background: on ? L.ink : '#fff', color: on ? '#fff' : L.ink, fontWeight: on ? 600 : 400,
  })
  const input: React.CSSProperties = {
    padding: '10px 12px', border: `1px solid ${L.line}`, borderRadius: '10px',
    fontSize: '14px', fontFamily: F.sans, background: '#fff',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'oklch(0.25 0.01 60 / 0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 24px', zIndex: 60, overflowY: 'auto' }}>
      <div style={{ ...cardStyle, borderRadius: '18px', padding: '26px', width: '560px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={microLabel}>Block dates · nothing is saved yet</span>
          <span style={{ fontFamily: F.serif, fontSize: '26px' }}>Hold these dates</span>
        </div>

        <div>
          <div style={microLabel}>Property</div>
          <div style={{ display: 'flex', gap: '7px', marginTop: '7px', flexWrap: 'wrap' }}>
            {PROPERTIES.map(p => (
              <button key={p.id} onClick={() => { setProp(p.id); setConflicts(null) }} style={chip(prop === p.id)}>{p.name}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <div style={microLabel}>From</div>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setConflicts(null) }} style={{ ...input, width: '100%', marginTop: '5px' }} />
          </div>
          <div>
            <div style={microLabel}>To</div>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setConflicts(null) }} style={{ ...input, width: '100%', marginTop: '5px' }} />
          </div>
        </div>

        <div>
          <div style={microLabel}>Reason</div>
          <div style={{ display: 'flex', gap: '7px', marginTop: '7px', flexWrap: 'wrap' }}>
            {REASONS.map(([id, label]) => (
              <button key={id} onClick={() => setReason(id)} style={chip(reason === id)}>{label}</button>
            ))}
          </div>
        </div>

        {reason === 'owner' && (
          <div>
            <div style={microLabel}>For</div>
            <div style={{ display: 'flex', gap: '7px', marginTop: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setBlockFor('myself')} style={chip(blockFor === 'myself')}>Myself</button>
              <button onClick={() => setBlockFor('friends-family')} style={chip(blockFor === 'friends-family')}>Friends &amp; family</button>
              {blockFor === 'friends-family' && (
                <input value={forName} onChange={e => setForName(e.target.value)} placeholder="Who is staying" style={{ ...input, flex: 1, minWidth: '160px' }} />
              )}
            </div>
          </div>
        )}

        <div>
          <div style={microLabel}>Notes</div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" style={{ ...input, width: '100%', marginTop: '5px' }} />
        </div>

        <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <span style={microLabel}>What this does</span>
          <span style={{ fontSize: '13px', lineHeight: 1.5 }}>
            {valid
              ? <>Blocks {NAME[prop]} for {n} night{n === 1 ? '' : 's'}, {from} → {to}.</>
              : <span style={{ color: L.inkMuted }}>Pick a property and a date range.</span>}
          </span>
          <span style={{ fontSize: '12px', color: L.inkMuted }}>Not a booking — no guest, no money, no door code.</span>
          {conflicts !== null && conflicts.length === 0 && (
            <span style={{ fontSize: '13px', color: L.green }}>✓ Nothing else is on those dates.</span>
          )}
        </div>

        {conflicts !== null && conflicts.length > 0 && (
          <div style={{ background: L.redWash, border: `1px solid ${L.redLine}`, borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ ...microLabel, color: L.red }}>Already on those dates</span>
            {conflicts.map((c: any) => (
              <span key={c.id} style={{ fontSize: '13px', color: L.ink }}>
                {c.kind === 'booking' ? '● ' : '○ '}{c.label}
              </span>
            ))}
            <span style={{ fontSize: '12px', color: L.red, lineHeight: 1.5 }}>
              Blocking would sit on top of {conflicts.length === 1 ? 'it' : 'them'}.
            </span>
          </div>
        )}

        {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {conflicts === null ? (
            <button onClick={check} disabled={busy || !valid}
              style={{ padding: '12px 20px', borderRadius: '10px', background: valid ? L.ink : L.line, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: valid ? 'pointer' : 'not-allowed', fontFamily: F.sans }}>
              {busy ? 'Checking…' : 'Check these dates'}
            </button>
          ) : conflicts.length === 0 ? (
            <button onClick={() => commit(false)} disabled={busy}
              style={{ padding: '12px 20px', borderRadius: '10px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans }}>
              {busy ? 'Blocking…' : 'Block these dates'}
            </button>
          ) : (<>
            <button onClick={() => setConflicts(null)} disabled={busy}
              style={{ padding: '12px 20px', borderRadius: '10px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans }}>
              Pick other dates
            </button>
            <button onClick={() => commit(true)} disabled={busy}
              style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: `1px solid ${L.redLine}`, color: L.red, fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: F.sans }}>
              {busy ? 'Blocking…' : 'Block anyway'}
            </button>
          </>)}
          <button onClick={onClose} disabled={busy}
            style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: 'none', color: L.inkMuted, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
