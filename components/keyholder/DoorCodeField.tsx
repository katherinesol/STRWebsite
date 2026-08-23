'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel } from '@/lib/design-tokens'

/** Setting the door code by hand — which, until now, there was no way to do.
 *
 *  Codes have only ever arrived here from Haussy reading a screenshot, the iCal
 *  sync, or the cron reprogramming a lock through Seam. Today's "Set code" link
 *  had nowhere to land. This is that control.
 *
 *  TWO COLUMNS, and they are not interchangeable: a platform stay keeps its code
 *  in calendar_blocks.door_code, a direct one in bookings.lock_code. Writing the
 *  wrong one stores a code nothing reads.
 *
 *  THE SUGGESTION IS THE LAST FOUR OF THE GUEST'S PHONE, which is the convention
 *  already in the data — shawn robins ends 7083 and his code is 7083, Mikaela
 *  ends 6220 and hers is 6220. It only appears when a phone is actually on the
 *  booking. Airbnb withholds guest numbers, so on four of five platform stays
 *  there is nothing to suggest from and the field stands alone rather than
 *  offering the last four of nothing.
 *
 *  Nothing here reaches a lock. It records the code against the booking; the
 *  morning sweep is what puts it on the device and reports back. */

export default function DoorCodeField({
  bookingId, kind, current, guestPhone,
}: {
  bookingId: string
  kind: 'direct' | 'platform'
  current: string | null
  guestPhone: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(current || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const digits = String(guestPhone || '').replace(/\D/g, '')
  const suggestion = digits.length >= 4 ? digits.slice(-4) : null
  const column = kind === 'direct' ? 'lock_code' : 'door_code'
  const endpoint = kind === 'direct'
    ? `/api/admin/bookings/${bookingId}`
    : `/api/admin/calendar/block/${bookingId}`

  async function save(code: string) {
    const clean = code.replace(/\D/g, '')
    if (clean.length !== 4) { setErr('A door code is four digits.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [column]: clean }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not save'); return }
      setEditing(false); router.refresh()
    } catch { setErr('Could not save') }
    finally { setBusy(false) }
  }

  const btn: React.CSSProperties = {
    padding: '9px 15px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', fontFamily: F.sans, border: `1px solid ${L.line}`, background: L.card, color: L.ink,
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={microLabel}>Door code</span>
          <span style={{ fontFamily: F.mono, fontSize: '22px', letterSpacing: '0.3em', color: current ? L.ink : L.inkFaint }}>
            {current || '· · · ·'}
          </span>
        </div>
        <button onClick={() => { setVal(current || ''); setEditing(true) }} style={{ ...btn, marginLeft: 'auto' }}>
          {current ? 'Change' : 'Set a code'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span style={microLabel}>Door code</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
        <input
          value={val} onChange={e => setVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric" placeholder="0000" autoFocus
          style={{
            width: '110px', padding: '10px 13px', border: `1px solid ${L.line}`, borderRadius: '10px',
            fontFamily: F.mono, fontSize: '19px', letterSpacing: '0.22em', textAlign: 'center',
            background: '#fff', color: L.ink,
          }} />
        <button onClick={() => save(val)} disabled={busy || val.length !== 4}
          style={{ ...btn, background: L.ink, color: '#fff', border: 'none', opacity: busy || val.length !== 4 ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => { setEditing(false); setErr('') }} disabled={busy} style={btn}>Cancel</button>
      </div>

      {suggestion && suggestion !== val && (
        <button onClick={() => setVal(suggestion)} style={{
          alignSelf: 'flex-start', padding: '8px 13px', borderRadius: '99px',
          border: `1px solid ${L.amberLine}`, background: L.amberWash,
          fontSize: '12px', cursor: 'pointer', fontFamily: F.sans, color: L.amber,
        }}>
          Use <strong style={{ fontFamily: F.mono, letterSpacing: '0.1em' }}>{suggestion}</strong> — last four of their phone
        </button>
      )}

      <span style={{ fontSize: '12px', color: L.inkFaint, lineHeight: 1.5 }}>
        This records the code against the booking. Putting it on the lock is the morning
        sweep&rsquo;s job, and the Access card above reports what it last found.
      </span>
      {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}
    </div>
  )
}
