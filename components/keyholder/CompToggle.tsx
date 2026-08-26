'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { L, microLabel } from '@/lib/design-tokens'

/** Mark a stay as deliberately free.
 *
 *  The distinction this exists to record: a booking with total = 0 is either a
 *  comped stay or a booking nobody has finished entering, and in the data those
 *  are identical. The Today page warns about the second — correctly, since a
 *  stay with no figures is one nobody can tell has been paid — and until now it
 *  warned about the first too, chasing figures for a gift.
 *
 *  Setting the flag never touches `total`. A comped booking keeps its zero and
 *  the flag explains it, rather than an invented figure standing in for a
 *  decision. is_comp is in the EDITABLE allowlist on bookings/[id], so this
 *  writes through the hardened path like every other control here. */

export default function CompToggle({ bookingId, isComp, guestName }: {
  bookingId: string; isComp: boolean; guestName: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function set(value: boolean) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_comp: value }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not save'); return }
      router.refresh()
    } catch { setErr('Could not save') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ paddingTop: '10px', borderTop: `1px solid ${L.lineFaint}`, marginTop: '10px' }}>
      <div style={{ ...microLabel, marginBottom: '5px' }}>Free stay</div>
      {isComp ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: L.inkBody }}>
            Marked as a free stay — nothing will chase {guestName} for payment.
          </span>
          <button onClick={() => set(false)} disabled={busy}
            style={btn(false)}>{busy ? '…' : 'Not free after all'}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: L.inkBody }}>
            If this stay is a gift, say so — otherwise a booking with no figures keeps asking to be finished.
          </span>
          <button onClick={() => set(true)} disabled={busy}
            style={btn(true)}>{busy ? '…' : 'Mark as free stay'}</button>
        </div>
      )}
      {err && <div style={{ fontSize: '12px', color: L.red, marginTop: '5px' }}>{err}</div>}
    </div>
  )
}

const btn = (primary: boolean): React.CSSProperties => ({
  padding: '6px 13px', fontSize: '12px', borderRadius: '99px', cursor: 'pointer',
  fontFamily: 'inherit', border: `1px solid ${L.line}`,
  background: primary ? L.ink : L.card, color: primary ? '#fff' : L.ink,
})
