'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, format } from 'date-fns'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '12px' }}>
      <div style={{ fontSize: '12px', color: '#9A9A92' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

function TimeSelect({ value, onChange, standard }: { value: string; onChange: (v: string) => void; standard: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
      <option value="">Standard ({standard})</option>
      {Array.from({ length: 24 }, (_, h) => ['00', '30'].map(m => {
        const val = `${String(h).padStart(2, '0')}:${m}`
        const ampm = h >= 12 ? 'PM' : 'AM'
        const h12 = h % 12 || 12
        return <option key={val} value={val}>{h12}:{m} {ampm}</option>
      })).flat()}
    </select>
  )
}

export default function BookingEditForm({ booking }: { booking: any }) {
  const router = useRouter()
  const [form, setForm] = useState({
    check_in: booking.check_in || '',
    check_out: booking.check_out || '',
    guests: booking.guests || 2,
    guests_adults: booking.guests_adults || '',
    guests_children: booking.guests_children || 0,
    early_checkin: booking.early_checkin || false,
    early_checkin_time: booking.early_checkin_time || '',
    late_checkout: booking.late_checkout || false,
    late_checkout_time: booking.late_checkout_time || '',
    bag_drop: booking.bag_drop || 'none',
    instacart_requested: booking.instacart_requested || false,
    vehicle_count: booking.vehicle_count || 0,
    payment_method: booking.payment_method || 'etransfer',
    accommodation: booking.accommodation || '',
    cleaning_fee: booking.cleaning_fee || '',
    hst: booking.hst || '',
    mat: booking.mat || '',
    total: booking.total || '',
    deposit_amount: booking.deposit_amount || '',
    deposit_paid_at: booking.deposit_paid_at ? booking.deposit_paid_at.split('T')[0] : '',
    second_payment_amount: booking.second_payment_amount || '',
    second_due_date: booking.second_due_date || '',
    second_paid_at: booking.second_paid_at ? booking.second_paid_at.split('T')[0] : '',
    final_payment_amount: booking.final_payment_amount || '',
    final_due_date: booking.final_due_date || '',
    final_paid_at: booking.final_paid_at ? booking.final_paid_at.split('T')[0] : '',
    security_deposit_status: booking.security_deposit_status || 'none',
    status: booking.status || 'confirmed',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function set(key: string, value: unknown) {
    setSaved(false)
    setForm(f => {
      const updated = { ...f, [key]: value }
      // auto-recalculate payment dates when check-in changes
      if (key === 'check_in' && value) {
        const ci = new Date(value as string + 'T12:00:00')
        updated.second_due_date = format(addDays(ci, -60), 'yyyy-MM-dd')
        updated.final_due_date = format(addDays(ci, -30), 'yyyy-MM-dd')
      }
      return updated
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setSaved(true)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
      <Section title="Stay">
        <Field label="Property">
          <select value={booking.property_id} disabled style={{ ...inputStyle, background: '#2A2A28', color: '#666660' }}>
            <option>{booking.property_id}</option>
          </select>
        </Field>
        <Field label="Check-in">
          <input type="date" value={form.check_in} onChange={e => set('check_in', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Check-out">
          <input type="date" value={form.check_out} onChange={e => set('check_out', e.target.value)} min={form.check_in} style={inputStyle} />
        </Field>
        <Field label="Adults">
          <input type="number" value={form.guests_adults} onChange={e => set('guests_adults', parseInt(e.target.value) || 1)} min={1} style={inputStyle} />
        </Field>
        <Field label="Children (under 18)">
          <input type="number" value={form.guests_children} onChange={e => set('guests_children', parseInt(e.target.value) || 0)} min={0} style={inputStyle} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={e => set('status', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
            {['pending_payment', 'confirmed', 'active', 'completed', 'cancelled'].map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Check-in / checkout times">
        <Field label="Early check-in">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" checked={form.early_checkin} onChange={e => set('early_checkin', e.target.checked)} />
            {form.early_checkin && <TimeSelect value={form.early_checkin_time} onChange={v => set('early_checkin_time', v)} standard="4:00 PM" />}
          </div>
        </Field>
        <Field label="Late checkout">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="checkbox" checked={form.late_checkout} onChange={e => set('late_checkout', e.target.checked)} />
            {form.late_checkout && <TimeSelect value={form.late_checkout_time} onChange={v => set('late_checkout_time', v)} standard="11:00 AM" />}
          </div>
        </Field>
      </Section>

      <Section title="Add-ons">
        <Field label="Bag drop">
          <select value={form.bag_drop} onChange={e => set('bag_drop', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
            <option value="none">None</option>
            <option value="drop-off">Drop-off</option>
            <option value="pick-up">Pick-up</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <Field label="Instacart">
          <input type="checkbox" checked={form.instacart_requested} onChange={e => set('instacart_requested', e.target.checked)} />
        </Field>
        <Field label="Vehicles">
          <input type="number" value={form.vehicle_count} onChange={e => set('vehicle_count', parseInt(e.target.value) || 0)} min={0} style={{ ...inputStyle, maxWidth: '80px' }} />
        </Field>
      </Section>

      <Section title="Payment">
        <Field label="Method">
          <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
            <option value="etransfer">E-transfer</option>
            <option value="card">Credit card</option>
            <option value="cash">Cash</option>
          </select>
        </Field>
        <Field label="Accommodation ($)">
          <input type="number" value={form.accommodation} onChange={e => set('accommodation', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Cleaning fee ($)">
          <input type="number" value={form.cleaning_fee} onChange={e => set('cleaning_fee', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="HST ($)">
          <input type="number" value={form.hst} onChange={e => set('hst', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="MAT ($)">
          <input type="number" value={form.mat} onChange={e => set('mat', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Total ($)">
          <input type="number" value={form.total} onChange={e => set('total', e.target.value)} style={inputStyle} />
        </Field>
      </Section>

      <Section title="Payment schedule">
        <Field label="Deposit ($)">
          <input type="number" value={form.deposit_amount} onChange={e => set('deposit_amount', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Deposit paid">
          <input type="date" value={form.deposit_paid_at} onChange={e => set('deposit_paid_at', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="2nd payment ($)">
          <input type="number" value={form.second_payment_amount} onChange={e => set('second_payment_amount', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="2nd due date">
          <input type="date" value={form.second_due_date} onChange={e => set('second_due_date', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="2nd paid">
          <input type="date" value={form.second_paid_at} onChange={e => set('second_paid_at', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Final payment ($)">
          <input type="number" value={form.final_payment_amount} onChange={e => set('final_payment_amount', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Final due date">
          <input type="date" value={form.final_due_date} onChange={e => set('final_due_date', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Final paid">
          <input type="date" value={form.final_paid_at} onChange={e => set('final_paid_at', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Security deposit">
          <select value={form.security_deposit_status} onChange={e => set('security_deposit_status', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
            <option value="none">None</option>
            <option value="pending">Pending</option>
            <option value="held">Held</option>
            <option value="released">Released</option>
          </select>
        </Field>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 28px', background: saving ? '#363634' : 'var(--amber)', color: saving ? '#9A9A92' : '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
