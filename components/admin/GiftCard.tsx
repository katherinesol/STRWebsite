'use client'
import { useState, useEffect, useRef } from 'react'

// Private gift tracking. Admin-only — the guest never sees any of this.
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }

type Expense = { id: string; date: string; vendor: string; amount: number; category: string; description: string; receipt_path: string | null }

export default function GiftCard({ bookingId, bookingKind }: { bookingId: string; bookingKind: 'direct' | 'platform' }) {
  const [note, setNote] = useState('')
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
      .then(d => { setNote(d.gift?.note || ''); setExpense(d.expense || null) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [bookingId, bookingKind])

  async function saveNote() {
    setSavingNote(true); setErr('')
    try {
      const res = await fetch('/api/admin/bookings/gift', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, booking_kind: bookingKind, note }),
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
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px', marginTop: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>Gift · private</div>
      <div style={{ fontSize: '11px', color: '#666660', marginBottom: '14px' }}>Never shown to the guest.</div>

      <div style={{ marginBottom: '12px' }}>
        <div style={labelStyle}>Gift note</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="e.g. bottle of wine"
          style={{ ...inputStyle, resize: 'vertical' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
          <button onClick={saveNote} disabled={savingNote}
            style={{ padding: '7px 16px', background: '#363634', color: '#F5F2EC', border: '0.5px solid #4A4A48', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
            {savingNote ? 'Saving…' : 'Save note'}
          </button>
          {noteSaved && <span style={{ fontSize: '11px', color: '#2ecc71' }}>✓ Saved</span>}
        </div>
      </div>

      {expense ? (
        <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Logged as expense</div>
          <div style={{ fontSize: '13px', color: '#F5F2EC' }}>${Number(expense.amount).toFixed(2)} · {expense.vendor}</div>
          <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '3px' }}>{expense.date} · {expense.category}</div>
          {expense.receipt_path && <div style={{ fontSize: '11px', color: '#666660', marginTop: '3px' }}>📎 receipt attached</div>}
          <div style={{ fontSize: '11px', color: '#666660', marginTop: '8px' }}>
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
              style={{ padding: '7px 14px', background: '#363634', color: '#F5F2EC', border: '0.5px solid #4A4A48', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : 'Attach receipt'}
            </button>
            {receiptName && <span style={{ fontSize: '11px', color: '#9A9A92' }}>📎 {receiptName}</span>}
          </div>

          <button onClick={logExpense} disabled={logging || !amount || !date}
            style={{ padding: '9px 20px', background: amount && date ? 'var(--amber)' : '#363634', color: amount && date ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500, cursor: amount && date ? 'pointer' : 'not-allowed' }}>
            {logging ? 'Logging…' : 'Log as expense'}
          </button>
          <div style={{ fontSize: '11px', color: '#666660', marginTop: '8px' }}>
            Files under Supplies (cleaning, guest) — CRA-aligned. Save the note first.
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: '12px', color: '#e74c3c', marginTop: '10px' }}>{err}</div>}
    </div>
  )
}
