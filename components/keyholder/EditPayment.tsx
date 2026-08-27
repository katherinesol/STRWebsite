'use client'
import { useState } from 'react'
import MethodPicker, { DETAILED } from '@/components/admin/MethodPicker'
import { L, F, microLabel, money } from '@/lib/design-tokens'

/*  Correcting a payment that was already recorded.
 *
 *  Without this the only way to fix a mistyped amount was to delete the payment
 *  and log it again, which destroys the filed expense and mints a new one with a
 *  new id and today's date — an identity change for a text fix.
 *
 *  Two steps, like the deletes: the preview asks the endpoint what would happen
 *  and writes nothing, so the confirmation can name the consequence with real
 *  figures — including what becomes of the expense, whether the invoice ends up
 *  overpaid, and whether an expense was filed that can no longer be found. */

export default function EditPayment({ payment, onSaved }: { payment: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<any>(null)
  const [pv, setPv] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function start() {
    setF({
      amount: String(payment.amount ?? ''),
      method: payment.method || 'etransfer',
      method_detail: (payment.method_detail || '').trim(),
      method_last4: payment.method_last4 || '',
      paid_at: (payment.paid_at || '').slice(0, 10),
      reference: payment.reference || '',
    })
    setPv(null); setErr(''); setOpen(true)
  }

  const body = () => ({
    amount: Number(f.amount), method: f.method,
    method_detail: DETAILED.includes(f.method) ? (f.method_detail.trim() || null) : null,
    method_last4: DETAILED.includes(f.method) ? (f.method_last4 || null) : null,
    paid_at: f.paid_at || null, reference: f.reference.trim() || null,
  })

  async function go(confirm: boolean) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/invoices/payment?id=${payment.id}${confirm ? '&confirm=true' : ''}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.detail || j.error || 'Could not save'); return }
      if (confirm) { setOpen(false); setPv(null); onSaved() } else setPv(j)
    } catch { setErr('Could not save') }
    finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button onClick={start} style={{
        background: 'none', border: 'none', color: L.inkFaint, cursor: 'pointer',
        fontSize: '12px', padding: '2px 6px', fontFamily: F.sans,
      }}>Edit</button>
    )
  }

  const nothingChanged = pv && !pv.changed?.amount && !pv.changed?.method && !pv.changed?.paid_at

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'oklch(0.25 0.01 60 / 0.45)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{ background: L.card, borderRadius: '14px', padding: '24px', maxWidth: '470px', width: '100%', border: `1px solid ${L.line}`, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontFamily: F.serif, fontSize: '22px', marginBottom: '14px' }}>Correct this payment</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '11px' }}>
          <label style={col}><span style={microLabel}>Amount</span>
            <input value={f.amount} inputMode="decimal" onChange={e => { setF({ ...f, amount: e.target.value }); setPv(null) }} style={inp} /></label>
          <label style={col}><span style={microLabel}>Paid on</span>
            <input type="date" value={f.paid_at} onChange={e => { setF({ ...f, paid_at: e.target.value }); setPv(null) }} style={inp} /></label>
          <label style={col}><span style={microLabel}>Method</span>
            <select value={f.method} onChange={e => { setF({ ...f, method: e.target.value }); setPv(null) }} style={inp}>
              {['etransfer', 'billpay', 'card', 'cash', 'cheque'].map(m => <option key={m} value={m}>{m}</option>)}
            </select></label>
          <label style={col}><span style={microLabel}>Reference</span>
            <input value={f.reference} onChange={e => { setF({ ...f, reference: e.target.value }); setPv(null) }} placeholder="confirmation no." style={inp} /></label>
        </div>

        <div style={{ marginTop: '11px' }}>
          <MethodPicker method={f.method} detail={f.method_detail} last4={f.method_last4}
            onChange={(d, l) => { setF({ ...f, method_detail: d, method_last4: l }); setPv(null) }} />
        </div>

        {pv && (
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${L.lineSoft}`, fontSize: '13px', color: L.inkBody, lineHeight: 1.6 }}>
            {nothingChanged && <div style={{ color: L.inkFaint }}>Nothing has changed.</div>}
            {pv.changed?.amount && <div>Amount {money(pv.before.amount)} → <strong style={{ color: L.ink }}>{money(pv.after.amount)}</strong></div>}
            {pv.changed?.paid_at && <div>Paid on {pv.before.paid_at || '—'} → <strong style={{ color: L.ink }}>{pv.after.paid_at}</strong></div>}
            {pv.changed?.method && <div>Method → <strong style={{ color: L.ink }}>{pv.after.method}{pv.after.method_detail ? ` ${pv.after.method_detail}` : ''}{pv.after.method_last4 ? ` ···${pv.after.method_last4}` : ''}</strong></div>}
            {pv.expense && (
              <div style={{ marginTop: '6px' }}>
                Its filed expense stays the same record — same date, same vendor — and follows:{' '}
                {pv.changed?.amount ? <>amount {money(pv.expense.amount)} → <strong style={{ color: L.ink }}>{money(pv.expense.will.amount)}</strong>. </> : null}
                {pv.changed?.method ? <>Its description is rewritten to name the new account. </> : null}
                {!pv.changed?.amount && !pv.changed?.method ? 'no change needed.' : ''}
              </div>
            )}
            {!pv.expense && !pv.orphan_warning && <div style={{ marginTop: '6px', color: L.inkFaint }}>No expense was filed for this payment, so nothing else changes.</div>}
            {pv.orphan_warning && (
              <div style={{ background: L.amberWash, border: `1px solid ${L.amberLine}`, borderRadius: '9px', padding: '10px 12px', marginTop: '8px' }}>
                An expense was filed for this payment but nothing recorded which one, so it cannot be
                found and <strong>will keep its old amount</strong>. Your books and this payment will
                disagree until it is relinked.
              </div>
            )}
            {pv.overpay_warning && (
              <div style={{ background: L.amberWash, border: `1px solid ${L.amberLine}`, borderRadius: '9px', padding: '10px 12px', marginTop: '8px' }}>
                This takes the paid total to <strong>{money(pv.overpay_warning.paid)}</strong> against an
                invoice of <strong>{money(pv.overpay_warning.total)}</strong> — over by{' '}
                <strong>{money(pv.overpay_warning.over)}</strong>.
              </div>
            )}
          </div>
        )}

        {err && <div style={{ fontSize: '13px', color: L.red, marginTop: '10px' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button autoFocus onClick={() => { setOpen(false); setPv(null); setErr('') }} style={btn(false)}>Keep it as it is</button>
          {!pv
            ? <button onClick={() => go(false)} disabled={busy} style={btn(true)}>{busy ? 'Checking…' : 'Show me what changes'}</button>
            : <button onClick={() => go(true)} disabled={busy || nothingChanged} style={btn(true, nothingChanged)}>{busy ? 'Saving…' : 'Save the correction'}</button>}
        </div>
      </div>
    </div>
  )
}

const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '5px' }
const inp: React.CSSProperties = {
  padding: '8px 11px', fontSize: '13px', border: `1px solid ${L.line}`,
  borderRadius: '7px', background: L.card, color: L.ink, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
const btn = (primary: boolean, disabled?: boolean): React.CSSProperties => ({
  padding: '9px 16px', borderRadius: '99px', fontSize: '14px', fontWeight: primary ? 600 : 400,
  cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: F.sans,
  border: primary ? 'none' : `1px solid ${L.line}`,
  background: primary ? (disabled ? L.line : L.ink) : L.card,
  color: primary ? (disabled ? L.inkFaint : '#fff') : L.ink,
})
