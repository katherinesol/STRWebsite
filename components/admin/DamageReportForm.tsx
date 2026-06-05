'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}

type Booking = {
  id: string
  property_id: string
  check_in: string
  check_out: string
  guests: { name: string } | { name: string }[] | null
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

export default function DamageReportForm({ bookings }: { bookings: Booking[] }) {
  const router = useRouter()
  const [form, setForm] = useState({
    booking_id: '',
    property_id: '',
    item: '',
    location: '',
    description: '',
    amount_claimed: '',
    linked_to_deposit: false,
  })
  const [saving, setSaving] = useState(false)

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleBookingSelect(bookingId: string) {
    const booking = bookings.find(b => b.id === bookingId)
    set('booking_id', bookingId)
    if (booking) set('property_id', booking.property_id)
  }

  async function handleSubmit() {
    if (!form.item || !form.property_id) return
    setSaving(true)
    try {
      await fetch('/api/admin/damage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount_claimed: form.amount_claimed ? parseFloat(form.amount_claimed) : null,
          booking_id: form.booking_id || null,
        }),
      })
      router.push('/admin/damage')
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* booking */}
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Booking (optional)</div>
          <select value={form.booking_id} onChange={e => handleBookingSelect(e.target.value)}
            style={{ ...inputStyle, background: '#363634' }}>
            <option value="">Select booking...</option>
            {bookings.map(b => (
              <option key={b.id} value={b.id}>
                {(b.guests as any)?.name} · {PROPERTY_NAMES[b.property_id]} · {format(new Date(b.check_in), 'MMM d, yyyy')}
              </option>
            ))}
          </select>
        </div>

        {/* property */}
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Property</div>
          <select value={form.property_id} onChange={e => set('property_id', e.target.value)}
            style={{ ...inputStyle, background: '#363634' }}>
            <option value="">Select property...</option>
            {Object.entries(PROPERTY_NAMES).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        {/* item */}
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Item damaged</div>
          <input type="text" value={form.item} onChange={e => set('item', e.target.value)} placeholder="e.g. Sofa, TV remote, towel" style={inputStyle} />
        </div>

        {/* location */}
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Location in property</div>
          <input type="text" value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Living room, Master bedroom" style={inputStyle} />
        </div>

        {/* description */}
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Description</div>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Describe the damage..." style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {/* amount */}
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Amount to claim ($)</div>
          <input type="number" value={form.amount_claimed} onChange={e => set('amount_claimed', e.target.value)} placeholder="0.00" style={inputStyle} />
        </div>

        {/* link to deposit */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: form.linked_to_deposit ? 'var(--amber)' : '#4A4A48', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
            <div style={{ position: 'absolute', top: '2px', left: form.linked_to_deposit ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
          </div>
          <span style={{ fontSize: '13px', color: '#F5F2EC' }}>Link to security deposit claim</span>
          <input type="checkbox" checked={form.linked_to_deposit} onChange={e => set('linked_to_deposit', e.target.checked)} style={{ display: 'none' }} />
        </label>

        <button onClick={handleSubmit} disabled={!form.item || !form.property_id || saving}
          style={{
            padding: '12px', background: form.item && form.property_id ? 'var(--amber)' : '#363634',
            color: form.item && form.property_id ? '#1A1A18' : '#666660',
            border: 'none', fontFamily: 'var(--sans)', fontSize: '11px',
            letterSpacing: '.12em', textTransform: 'uppercase',
            cursor: form.item && form.property_id ? 'pointer' : 'not-allowed', fontWeight: 500,
          }}>
          {saving ? 'Saving...' : 'Submit report'}
        </button>
      </div>
    </div>
  )
}
