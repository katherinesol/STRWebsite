'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const PROPERTIES = [
  { id: 'royal-york-east', name: 'Royal York East Suite', nightly: 180 },
  { id: 'royal-york-west', name: 'Royal York West Suite', nightly: 180 },
  { id: 'nickel-beach',    name: 'Nickel Beach Retreat',  nightly: 320 },
]

const PLATFORMS = ['direct', 'airbnb', 'vrbo', 'houfy', 'phone', 'other']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div style={{ gridColumn: half ? 'span 1' : 'span 2' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
      {children}
    </div>
  )
}

export default function ManualBookingForm({ guests }: { guests: { id: string; name: string; email: string }[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    guest_name: '', guest_email: '', guest_phone: '',
    use_existing: '', property_id: 'royal-york-east',
    check_in: '', check_out: '', guests: 2,
    platform: 'direct', payment_method: 'etransfer',
    total: '', deposit_amount: '', notes: '',
  })

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.check_in || !form.check_out || (!form.guest_name && !form.use_existing)) return
    setSaving(true)
    try {
      await fetch('/api/admin/bookings/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      router.push('/admin/bookings')
    } catch {}
    finally { setSaving(false) }
  }

  const [busy, setBusy] = useState<{ start: string; end: string }[]>([])

  useEffect(() => {
    if (!form.property_id) return
    fetch(`/api/admin/availability?property_id=${form.property_id}`)
      .then(r => r.json())
      .then(d => setBusy(d.busy || []))
      .catch(() => setBusy([]))
  }, [form.property_id])

  // overlap check: [check_in, check_out) vs each busy [start, end)
  const conflict = form.check_in && form.check_out
    ? busy.find(b => form.check_in < b.end && form.check_out > b.start)
    : null

  const canSave = form.check_in && form.check_out && !conflict && (form.guest_name || form.use_existing)

  return (
    <div style={{ maxWidth: '680px' }}>
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>Guest</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Field label="Existing guest" half>
            <select value={form.use_existing} onChange={e => { set('use_existing', e.target.value); if (e.target.value) { const g = guests.find(g => g.id === e.target.value); if (g) { set('guest_name', g.name); set('guest_email', g.email) } } }}
              style={{ ...inputStyle, background: '#363634' }}>
              <option value="">New guest</option>
              {guests.map(g => <option key={g.id} value={g.id}>{g.name} — {g.email}</option>)}
            </select>
          </Field>
          <Field label="Platform" half>
            <select value={form.platform} onChange={e => set('platform', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Full name" half>
            <input type="text" value={form.guest_name} onChange={e => set('guest_name', e.target.value)} placeholder="Jane Smith" style={inputStyle} />
          </Field>
          <Field label="Email" half>
            <input type="email" value={form.guest_email} onChange={e => set('guest_email', e.target.value)} placeholder="jane@email.com" style={inputStyle} />
          </Field>
          <Field label="Phone" half>
            <input type="tel" value={form.guest_phone} onChange={e => set('guest_phone', e.target.value.replace(/[^\d+\-\s()]/g, ''))} placeholder="+1 416 000 0000" style={inputStyle} />
          </Field>
        </div>
      </div>

      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>Stay</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Field label="Property">
            <select value={form.property_id} onChange={e => set('property_id', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
              {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Guests" half>
            <input type="number" value={form.guests} onChange={e => set('guests', parseInt(e.target.value))} min={1} max={10} style={inputStyle} />
          </Field>
          <Field label="Check-in" half>
            <input type="date" value={form.check_in} onChange={e => set('check_in', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Check-out" half>
            <input type="date" value={form.check_out} onChange={e => set('check_out', e.target.value)} min={form.check_in} style={inputStyle} />
            {conflict && (
              <div style={{ fontSize: '11px', color: '#e74c3c', marginTop: '4px' }}>
                ⚠ Dates unavailable — conflicts with existing booking/block ({conflict.start} → {conflict.end})
              </div>
            )}
          </Field>
        </div>
      </div>

      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>Payment</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Field label="Payment method" half>
            <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
              <option value="etransfer">E-transfer</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
            </select>
          </Field>
          <Field label="Total ($)" half>
            <input type="number" value={form.total} onChange={e => set('total', e.target.value)} placeholder="0.00" style={inputStyle} />
          </Field>
          <Field label="Deposit paid ($)" half>
            <input type="number" value={form.deposit_amount} onChange={e => set('deposit_amount', e.target.value)} placeholder="0.00" style={inputStyle} />
          </Field>
          <Field label="Notes">
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes" style={inputStyle} />
          </Field>
        </div>
      </div>

      <button onClick={handleSave} disabled={!canSave || saving}
        style={{ padding: '12px 32px', background: canSave ? 'var(--amber)' : '#363634', color: canSave ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', cursor: canSave ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
        {saving ? 'Saving...' : 'Create booking'}
      </button>
    </div>
  )
}
