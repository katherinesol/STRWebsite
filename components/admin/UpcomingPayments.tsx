'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

/* Scheduled invoice payments — what is planned but not yet paid.
 *
 *  This sat on the legacy Finance page, which was the wrong home: it reads
 *  invoice_payments, it is keyed on a due date, and marking one paid files the
 *  matching expense against its invoice. That is invoice work, not expense
 *  work, so it lives on the Invoices screen now.
 *
 *  Restyled to the light tokens; the logic is untouched. Renders nothing when
 *  there is nothing scheduled, which is why it can sit above the invoice list
 *  without leaving a hole on a quiet month. */

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach',
}

export default function UpcomingPayments({ onPaid }: { onPaid?: () => void }) {
  const router = useRouter()
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
    setMarking(null); load(); onPaid?.()
  }

  if (loading) return null
  if (!payments.length) return null

  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const fmtDue = (d: string) => !d || d === 'completion' ? 'On completion' : new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  const isOverdue = (d: string) => d && d !== 'completion' && d < new Date().toISOString().split('T')[0]
  const overdue = payments.filter(p => isOverdue(p.due_date)).length

  return (
    <div style={{ ...cardStyle, border: `1px solid ${overdue ? L.redLine : L.line}`, overflow: 'hidden', marginBottom: '22px' }}>
      <div style={{ padding: '12px 20px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <span style={{ ...microLabel, letterSpacing: '0.12em' }}>Scheduled — not yet paid</span>
        <span style={{ fontSize: '13px', color: overdue ? L.red : L.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
          {money(total)} planned{overdue ? ` · ${overdue} overdue` : ''}
        </span>
      </div>
      {payments.map(p => (
        <div key={p.id} onClick={() => router.push(`/keyholder/money/invoices/${p.invoice_id}`)}
          style={{ padding: '13px 20px', borderBottom: `1px solid ${L.lineFaint}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', color: L.ink, fontVariantNumeric: 'tabular-nums' }}>
              {money(p.amount)} · {p.vendor}
            </div>
            <div style={{ fontSize: '12px', color: L.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.title}{p.property_id ? ` · ${PROPERTY_NAMES[p.property_id] || p.property_id}` : ''}
              {p.method ? ` · ${p.method}` : ''}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: isOverdue(p.due_date) ? L.red : L.inkBody, whiteSpace: 'nowrap' }}>
            {isOverdue(p.due_date) ? 'Overdue · ' : 'Due '}{fmtDue(p.due_date)}
          </div>
          <button onClick={e => { e.stopPropagation(); markPaid(p.id) }} disabled={marking === p.id}
            style={{ padding: '8px 15px', background: marking === p.id ? L.lineSoft : L.card, color: marking === p.id ? L.inkFaint : L.ink,
              border: `1px solid ${L.line}`, borderRadius: '99px', fontSize: '13px', fontWeight: 600,
              cursor: marking === p.id ? 'wait' : 'pointer', whiteSpace: 'nowrap', fontFamily: F.sans }}>
            {marking === p.id ? 'Filing…' : 'Mark paid'}
          </button>
        </div>
      ))}
      <div style={{ padding: '10px 20px', fontSize: '11px', color: L.inkFaint }}>
        Marking one paid also files the expense against its invoice.
      </div>
    </div>
  )
}
