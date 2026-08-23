'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel } from '@/lib/design-tokens'

/** The confirmation code — the one a guest types on the support page, together
 *  with their surname, to talk to the concierge about their stay. Not the door
 *  code; they are different things and the legacy card labelled it correctly
 *  even though its filename suggested otherwise.
 *
 *  Writes through /bookings/set-code, which is already hasRole-gated and touches
 *  exactly one column. */
export function ConfirmationCodeField({
  bookingId, kind, current,
}: { bookingId: string; kind: 'direct' | 'platform'; current: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(current || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/bookings/set-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, source: kind === 'direct' ? 'booking' : 'block', code: val.trim() }),
      })
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'Could not save'); return }
      setEditing(false); router.refresh()
    } catch { setErr('Could not save') } finally { setBusy(false) }
  }

  const btn: React.CSSProperties = {
    padding: '8px 13px', borderRadius: '9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    fontFamily: F.sans, border: `1px solid ${L.line}`, background: L.card, color: L.ink,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      <span style={microLabel}>Confirmation code · support chat</span>
      {editing ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input value={val} onChange={e => setVal(e.target.value)} autoFocus placeholder="Enter code"
            style={{ flex: 1, minWidth: '160px', padding: '9px 12px', border: `1px solid ${L.line}`, borderRadius: '9px', fontFamily: F.mono, fontSize: '14px', background: '#fff', color: L.ink }} />
          <button onClick={save} disabled={busy} style={{ ...btn, background: L.ink, color: '#fff', border: 'none' }}>{busy ? 'Saving…' : 'Save'}</button>
          <button onClick={() => setEditing(false)} disabled={busy} style={btn}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: F.mono, fontSize: '15px', letterSpacing: '0.05em', color: current ? L.ink : L.inkFaint }}>
            {current || '— none —'}
          </span>
          {current && (
            <button onClick={() => { navigator.clipboard.writeText(current); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              style={{ ...btn, padding: '5px 10px' }}>{copied ? '✓' : 'copy'}</button>
          )}
          <button onClick={() => { setVal(current || ''); setEditing(true) }} style={{ ...btn, marginLeft: 'auto' }}>
            {current ? 'Change' : 'Set'}
          </button>
        </div>
      )}
      {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}
    </div>
  )
}
