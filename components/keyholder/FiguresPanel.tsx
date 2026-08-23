'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

/** "Add the figures" — the panel Today's link lands on.
 *
 *  You type only what you know: the room subtotal, the cleaning fee, any extras.
 *  HST, MAT and the total are never typed. They come back from the server, which
 *  computes them from lib/tax-rates.ts — the property's real MAT rate, the
 *  30-night exemption, cleaning inside the HST base — and you see the whole
 *  split before anything is written.
 *
 *  Two round trips on purpose. The first is preview:true and writes nothing; the
 *  second is the same numbers without it. The arithmetic you approve is the
 *  arithmetic that lands, because the server does it both times rather than the
 *  browser guessing once and the server disagreeing later.
 *
 *  Idempotent: the figures are derived from what you typed, so sending the same
 *  input twice writes the same row twice over. There is no accumulating column
 *  and no second record to duplicate. Atomic: one UPDATE on one row. */

export default function FiguresPanel({
  bookingId, guestName, current,
}: {
  bookingId: string
  guestName: string
  current: { accommodation: any; cleaning_fee: any; addon_fee: any; hst: any; mat: any; total: any }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [accommodation, setAccommodation] = useState(current.accommodation ? String(current.accommodation) : '')
  const [cleaning, setCleaning] = useState(current.cleaning_fee ? String(current.cleaning_fee) : '')
  const [extras, setExtras] = useState(current.addon_fee ? String(current.addon_fee) : '')
  const [pv, setPv] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const body = () => ({
    accommodation: accommodation === '' ? 0 : Number(accommodation),
    cleaning: cleaning === '' ? 0 : Number(cleaning),
    extras: extras === '' ? 0 : Number(extras),
  })

  async function call(preview: boolean) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/figures`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body(), ...(preview ? { preview: true } : {}) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not work the figures out'); return null }
      return d
    } catch { setErr('Could not work the figures out'); return null }
    finally { setBusy(false) }
  }

  const btn: React.CSSProperties = {
    padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: F.sans, border: `1px solid ${L.line}`, background: L.card, color: L.ink,
  }
  const input = (v: string, set: (s: string) => void, ph: string) => (
    <input value={v} onChange={e => set(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={ph}
      style={{ width: '100%', padding: '10px 12px', border: `1px solid ${L.line}`, borderRadius: '9px',
               fontFamily: F.mono, fontSize: '14px', background: '#fff', color: L.ink, boxSizing: 'border-box' }} />
  )
  const delta = (label: string, before: any, after: any) => {
    const changed = String(before ?? '') !== String(after ?? '')
    return (
      <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '12px', fontSize: '13px', padding: '9px 0', borderBottom: `1px solid ${L.lineFaint}` }}>
        <span style={{ color: L.inkMuted, width: '150px' }}>{label}</span>
        <span style={{ color: L.inkFaint, textDecoration: changed && before != null ? 'line-through' : 'none' }}>
          {before == null ? '—' : money(before)}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontWeight: changed ? 600 : 400 }}>{money(after)}</span>
      </div>
    )
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...btn, background: L.ink, color: '#fff', border: 'none', alignSelf: 'flex-start' }}>
        {current.total ? 'Change the figures' : 'Add the figures'}
      </button>
    )
  }

  return (
    <div style={{ ...cardStyle, padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={microLabel}>Add the figures · {guestName}</span>
        <span style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.5 }}>
          Give the room subtotal and the fees. HST, MAT and the total are worked out from
          the property&rsquo;s tax rules — never typed.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        <div><div style={microLabel}>Room subtotal</div><div style={{ marginTop: '5px' }}>{input(accommodation, setAccommodation, '0.00')}</div></div>
        <div><div style={microLabel}>Cleaning</div><div style={{ marginTop: '5px' }}>{input(cleaning, setCleaning, '0.00')}</div></div>
        <div><div style={microLabel}>Extras</div><div style={{ marginTop: '5px' }}>{input(extras, setExtras, '0.00')}</div></div>
      </div>
      <span style={{ fontSize: '12px', color: L.inkFaint }}>
        Already net of any discount — a direct booking has no column to record one separately.
      </span>

      {pv && (
        <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ ...microLabel, marginBottom: '4px' }}>Before → after</span>
          {delta('Accommodation', pv.before.accommodation, pv.after.accommodation)}
          {delta('Cleaning', pv.before.cleaning_fee, pv.after.cleaning_fee)}
          {Number(pv.after.addon_fee) > 0 && delta('Extras', pv.before.addon_fee, pv.after.addon_fee)}
          {delta('HST', pv.before.hst, pv.after.hst)}
          {delta('MAT', pv.before.mat, pv.after.mat)}
          {delta('Total', pv.before.total, pv.after.total)}
          <span style={{ fontSize: '12px', color: pv.workings.apply_tax ? L.inkBody : L.amber, lineHeight: 1.5, paddingTop: '10px' }}>
            {pv.workings.note}
            {pv.workings.mat_exempt && ' The stay is over 29 nights, so MAT does not apply.'}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
        {!pv ? (
          <button disabled={busy || accommodation === ''} onClick={async () => { const d = await call(true); if (d) setPv(d) }}
            style={{ ...btn, background: L.ink, color: '#fff', border: 'none', opacity: busy || accommodation === '' ? 0.5 : 1 }}>
            {busy ? 'Working it out…' : 'Work out the tax'}
          </button>
        ) : (
          <button disabled={busy} onClick={async () => { const d = await call(false); if (d) { setOpen(false); setPv(null); router.refresh() } }}
            style={{ ...btn, background: L.ink, color: '#fff', border: 'none' }}>
            {busy ? 'Saving…' : 'Save these figures'}
          </button>
        )}
        {pv && <button disabled={busy} onClick={() => setPv(null)} style={btn}>Change the numbers</button>}
        <button disabled={busy} onClick={() => { setOpen(false); setPv(null); setErr('') }} style={btn}>Cancel</button>
      </div>

      {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}
    </div>
  )
}
