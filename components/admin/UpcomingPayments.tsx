'use client'
import { useState, useEffect } from 'react'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach',
}

export default function UpcomingPayments() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)

  function load() {
    fetch('/api/admin/upcoming-payments').then(r => r.json()).then(d => {
      if (d.payments) setPayments(d.payments)
    }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function markPaid(id: string) {
    setMarking(id)
    await fetch('/api/admin/upcoming-payments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setMarking(null); load()
  }

  if (loading) return null
  if (!payments.length) return null

  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const fmtDue = (d: string) => !d || d === 'completion' ? 'On completion' : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const isOverdue = (d: string) => d && d !== 'completion' && d < new Date().toISOString().split('T')[0]

  return (
    <div style={{ marginBottom: '28px', background: '#242422', border: '0.5px solid #363634', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '0.5px solid #363634', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#e6a54b' }}>Upcoming Payments</span>
        <span style={{ fontSize: '13px', color: '#9A9A92' }}>${total.toFixed(2)} planned</span>
      </div>
      {payments.map(p => (
        <div key={p.id} onClick={() => { window.location.href = `/admin/invoices?open=${p.invoice_id}` }} style={{ padding: '12px 18px', borderBottom: '0.5px solid #2A2A28', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', color: '#F0EDE6' }}>${Number(p.amount).toFixed(2)} · {p.vendor}</div>
            <div style={{ fontSize: '12px', color: '#9A9A92', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.title}{p.property_id ? ` · ${PROPERTY_NAMES[p.property_id] || ''}` : ''}
              {p.method ? ` · ${p.method}` : ''}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: isOverdue(p.due_date) ? '#e74c3c' : '#AEAEA6', whiteSpace: 'nowrap' }}>
            {isOverdue(p.due_date) ? 'Overdue · ' : 'Due '}{fmtDue(p.due_date)}
          </div>
          <button onClick={(e) => { e.stopPropagation(); markPaid(p.id) }} disabled={marking === p.id} style={{ padding: '6px 14px', background: '#1f2a1a', color: '#2ecc71', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px', whiteSpace: 'nowrap' }}>
            {marking === p.id ? '…' : 'Mark paid'}
          </button>
        </div>
      ))}
    </div>
  )
}
