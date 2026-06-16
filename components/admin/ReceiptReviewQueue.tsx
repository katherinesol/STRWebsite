'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'
import { PROPERTY_OPTIONS } from '@/lib/property-options'

const CATEGORIES = [
  'Advertising', 'Insurance', 'Interest & bank charges', 'Office expenses',
  'Supplies', 'Professional fees', 'Management & admin fees', 'Repairs & maintenance',
  'Salaries & wages', 'Property taxes', 'Travel', 'Utilities', 'Motor vehicle', 'Other',
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: '#363634',
  border: '0.5px solid #4A4A48', color: '#F5F2EC',
  fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

type Pending = {
  id: string
  source: string
  from_address: string | null
  contact_name: string | null
  signed_receipt_url: string | null
  receipt_path: string | null
  vendor: string | null
  amount: number | null
  hst_paid: number | null
  expense_date: string | null
  category: string | null
  description: string | null
  created_at: string
}

function ReceiptCard({ p, onResolve }: { p: Pending; onResolve: (id: string) => void }) {
  const [f, setF] = useState({
    vendor: p.vendor || '',
    amount: p.amount != null ? String(p.amount) : '',
    hst_paid: p.hst_paid != null ? String(p.hst_paid) : '',
    date: p.expense_date || new Date().toISOString().split('T')[0],
    category: p.category || 'Other',
    description: p.description || '',
    property_id: '',
  })
  const [busy, setBusy] = useState(false)

  async function act(action: 'approve' | 'reject', force = false) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/pending-receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, action, fields: { ...f, receipt_path: p.receipt_path, force } }),
      })
      if (res.status === 409) {
        const dup = await res.json()
        if (confirm(`⚠ Possible duplicate:\n${dup.message}\n\nApprove anyway?`)) {
          setBusy(false)
          return act('approve', true)
        }
        setBusy(false)
        return
      }
      onResolve(p.id)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '18px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ fontSize: '12px', color: '#F5F2EC' }}>
          From <strong>{p.contact_name || p.from_address || 'Unknown'}</strong>
          <span style={{ fontSize: '10px', color: '#666660', marginLeft: '8px', textTransform: 'uppercase', letterSpacing: '.08em' }}>{p.source}</span>
        </div>
        {p.signed_receipt_url && (
          <a href={p.signed_receipt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>📎 View receipt</a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Vendor</div>
          <input value={f.vendor} onChange={e => setF(s => ({ ...s, vendor: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Amount</div>
          <input type="number" value={f.amount} onChange={e => setF(s => ({ ...s, amount: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>HST</div>
          <input type="number" value={f.hst_paid} onChange={e => setF(s => ({ ...s, hst_paid: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Date</div>
          <input type="date" value={f.date} onChange={e => setF(s => ({ ...s, date: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Category</div>
          <select value={f.category} onChange={e => setF(s => ({ ...s, category: e.target.value }))} style={inputStyle}>
            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Property</div>
          <select value={f.property_id} onChange={e => setF(s => ({ ...s, property_id: e.target.value }))} style={inputStyle}>
            {PROPERTY_OPTIONS.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Description</div>
        <input value={f.description} onChange={e => setF(s => ({ ...s, description: e.target.value }))} style={inputStyle} />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => act('approve')} disabled={busy}
          style={{ padding: '8px 20px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
          {busy ? '…' : 'Approve → add expense'}
        </button>
        <button onClick={() => act('reject')} disabled={busy}
          style={{ padding: '8px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          Reject
        </button>
      </div>
    </div>
  )
}

export default function ReceiptReviewQueue({ initialPending }: { initialPending: Pending[] }) {
  const [pending, setPending] = useState(initialPending)
  if (!pending.length) return null

  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '14px' }}>
        Receipts to review ({pending.length})
      </div>
      {pending.map(p => (
        <ReceiptCard key={p.id} p={p} onResolve={id => setPending(list => list.filter(x => x.id !== id))} />
      ))}
    </div>
  )
}
