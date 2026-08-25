'use client'
import { useState, useEffect, useRef } from 'react'
import { GIFT_OCCASIONS, occasionLabel } from '@/lib/gift-occasions'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

/* Private gift tracking — owner and co-owner only, and never rendered anywhere
 * a guest could see. The note and the occasion both live in booking_gifts
 * rather than on the booking, and the dashboards deliberately select only
 * booking_id from it, using presence as a silent badge. An occasion is as
 * revealing as the note: "anniversary" on a booking row tells anyone glancing
 * at the screen that a surprise is coming, which is the thing being prevented.
 *
 * Restyled to the keyholder tokens. It is mounted on two legacy dark pages as
 * well, where it will now look out of place — those are heading for retirement
 * the way Finance and Income did, and carrying a second palette to postpone
 * that would mean maintaining both forever. */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: L.card, border: `1px solid ${L.line}`,
  color: L.ink, fontFamily: F.sans, fontSize: '14px',
  outline: 'none', borderRadius: '10px', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { ...microLabel, marginBottom: '5px', display: 'block' }

type Expense = { id: string; date: string; vendor: string; amount: number; category: string; description: string; receipt_path: string | null }

export default function GiftCard({ bookingId, bookingKind }: { bookingId: string; bookingKind: 'direct' | 'platform' }) {
  const [note, setNote] = useState('')
  const [occasion, setOccasion] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [expense, setExpense] = useState<Expense | null>(null)
  const [err, setErr] = useState('')

  // expense draft
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [vendor, setVendor] = useState('')
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
  const [receiptName, setReceiptName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [logging, setLogging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/admin/bookings/gift?booking_id=${bookingId}&booking_kind=${bookingKind}`)
      .then(r => r.json())
      .then(d => { setNote(d.gift?.note || ''); setOccasion(d.gift?.occasion || ''); setExpense(d.expense || null) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [bookingId, bookingKind])

  async function saveNote() {
    setSavingNote(true); setErr('')
    try {
      const res = await fetch('/api/admin/bookings/gift', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, booking_kind: bookingKind, note, occasion: occasion || null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not save'); return }
      setNoteSaved(true); setTimeout(() => setNoteSaved(false), 2500)
    } finally { setSavingNote(false) }
  }

  // reuses the existing receipt pipeline: uploads to property-management/receipts
  // and returns AI-extracted vendor/amount to prefill the form
  async function uploadReceipt(file: File) {
    setUploading(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('receipt', file)
      const res = await fetch('/api/admin/expenses/extract', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (d.receipt_path) { setReceiptPath(d.receipt_path); setReceiptName(file.name) }
      if (d.vendor && !vendor) setVendor(d.vendor)
      if (d.amount && !amount) setAmount(String(d.amount))
      if (!d.receipt_path) setErr('Receipt upload failed — you can still log the expense without it.')
    } catch { setErr('Receipt upload failed — you can still log the expense without it.') }
    finally { setUploading(false) }
  }

  async function logExpense() {
    setLogging(true); setErr('')
    try {
      const res = await fetch('/api/admin/bookings/gift/expense', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, booking_kind: bookingKind, amount, date, vendor, receipt_path: receiptPath }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not log expense'); return }
      setExpense(d.expense || null)
    } catch { setErr('Could not log expense') }
    finally { setLogging(false) }
  }

  if (!loaded) return null

  return (
    <div style={{ ...cardStyle, padding: '22px', marginTop: '16px' }}>
      <div style={{ ...microLabel, color: L.amber, marginBottom: '4px' }}>Gift · private</div>
      <div style={{ fontSize: '12px', color: L.inkMuted, marginBottom: '16px' }}>
        Never shown to the guest, and never on a dashboard — only the fact that a gift exists.
      </div>

      <div style={{ marginBottom: '14px' }}>
        <div style={labelStyle}>Occasion</div>
        <select value={occasion} onChange={e => setOccasion(e.target.value)}
          style={{ ...inputStyle, background: L.card, marginBottom: '12px' }}>
          <option value="">— none —</option>
          {GIFT_OCCASIONS.map(o => <option key={o} value={o}>{occasionLabel(o)}</option>)}
        </select>
        <div style={labelStyle}>Gift note</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="e.g. bottle of wine"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: F.sans }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
          <button onClick={saveNote} disabled={savingNote}
            style={{ padding: '10px 18px', borderRadius: '10px', background: L.ink, color: '#fff', border: 'none', fontFamily: F.sans, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            {savingNote ? 'Saving…' : 'Save'}
          </button>
          {noteSaved && <span style={{ fontSize: '13px', color: L.green }}>Saved</span>}
        </div>
      </div>

      {expense ? (
        <div style={{ background: L.cardAlt, border: `1px solid ${L.lineSoft}`, borderRadius: '12px', padding: '14px 16px' }}>
          <div style={{ ...microLabel, marginBottom: '6px' }}>Logged as expense</div>
          <div style={{ fontSize: '15px', color: L.ink, fontVariantNumeric: 'tabular-nums' }}>{money(expense.amount)} · {expense.vendor}</div>
          <div style={{ fontSize: '12px', color: L.inkMuted, marginTop: '3px' }}>{expense.date} · {expense.category}</div>
          {expense.receipt_path && <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '3px' }}>Receipt attached</div>}
          <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '10px' }}>
            Editing the note above won&rsquo;t change this expense — it&rsquo;s a financial record. Adjust it in Expenses if needed.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <div style={labelStyle}>Amount</div>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Date</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <div style={labelStyle}>Vendor</div>
            <input type="text" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. LCBO" style={inputStyle} />
          </div>

          <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); e.target.value = '' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ padding: '9px 16px', borderRadius: '10px', background: L.card, color: L.ink, border: `1px solid ${L.line}`, fontFamily: F.sans, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : 'Attach receipt'}
            </button>
            {receiptName && <span style={{ fontSize: '12px', color: L.inkMuted }}>{receiptName}</span>}
          </div>

          <button onClick={logExpense} disabled={logging || !amount || !date}
            style={{ padding: '11px 20px', borderRadius: '10px', background: amount && date ? L.ink : L.lineSoft, color: amount && date ? '#fff' : L.inkFaint, border: 'none', fontFamily: F.sans, fontSize: '14px', fontWeight: 600, cursor: amount && date ? 'pointer' : 'not-allowed' }}>
            {logging ? 'Logging…' : 'Log as expense'}
          </button>
          <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '10px' }}>
            Files under Supplies (cleaning, guest) — CRA-aligned. Save the note first.
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: '13px', color: L.red, marginTop: '12px' }}>{err}</div>}
    </div>
  )
}
