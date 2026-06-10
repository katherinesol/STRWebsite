'use client'
import { useState } from 'react'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

export default function PaymentReminderForm({ booking, guest }: { booking: any; guest: any }) {
  const [form, setForm] = useState({
    amount_due: booking.final_payment_amount || booking.second_payment_amount || '',
    deposit_paid: booking.deposit_amount || '',
    due_date: booking.final_due_date || booking.second_due_date || '',
    note: '',
    etransfer_email: '',
    payment_method: booking.payment_method || 'etransfer',
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/send-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setSent(true)
      } else {
        setError(data.error || 'Failed to send')
      }
    } catch {
      setError('Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginTop: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>
        Send payment reminder to {guest?.name}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        {[
          { label: 'Amount due ($)', key: 'amount_due', type: 'number' },
          { label: 'Deposit paid ($)', key: 'deposit_paid', type: 'number' },
          { label: 'Due date', key: 'due_date', type: 'date' },
          { label: 'E-transfer email (leave blank for default)', key: 'etransfer_email', type: 'email' },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>{label}</div>
            <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Payment method</div>
        <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
          style={{ ...inputStyle, background: '#363634' }}>
          <option value="etransfer">E-transfer</option>
          <option value="card">Credit card</option>
          <option value="cash">Cash</option>
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Note to guest (optional)</div>
        <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          rows={3} placeholder="e.g. Please send before June 15th to confirm your booking"
          style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      {error && <div style={{ fontSize: '12px', color: '#e74c3c', marginBottom: '12px' }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={handleSend} disabled={sending || !form.amount_due || !form.due_date}
          style={{ padding: '10px 24px', background: sending || !form.amount_due ? '#363634' : 'var(--amber)', color: sending || !form.amount_due ? '#9A9A92' : '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
          {sending ? 'Sending...' : 'Send reminder'}
        </button>
        {sent && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓ Sent to {guest?.email}</span>}
      </div>
    </div>
  )
}
