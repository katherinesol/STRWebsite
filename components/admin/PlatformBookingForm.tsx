'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
      {children}
    </div>
  )
}

function ApprovalButtons({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {([{ val: true, label: 'Granted', color: '#2ecc71' }, { val: false, label: 'Denied', color: '#e74c3c' }, { val: null, label: 'N/A', color: '#888880' }] as const).map(({ val, label, color }) => (
        <button key={label} onClick={() => onChange(val)}
          style={{ padding: '6px 14px', background: value === val ? color : '#363634', color: value === val ? '#fff' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default function PlatformBookingForm({ block }: { block: any }) {
  const router = useRouter()
  const [guestEmail, setGuestEmail] = useState(block.guest_email || '')
  const [guestPhone, setGuestPhone] = useState(block.guest_phone || '')
  const [form, setForm] = useState({
    guest_name: block.guest_name || '',
    guest_notes: block.guest_notes || '',
    notes: block.notes || '',
    early_checkin_time: block.early_checkin_time || '',
    early_checkin_granted: block.early_checkin_granted ?? null,
    late_checkout_time: block.late_checkout_time || '',
    late_checkout_granted: block.late_checkout_granted ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/admin/calendar/block/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, guest_email: guestEmail, guest_phone: guestPhone }),
      })
      // sync to guests table if name provided
      if (form.guest_name) {
        await fetch('/api/admin/guests/sync-platform', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.guest_name,
            email: guestEmail,
            phone: guestPhone,
            property_id: block.property_id,
            platform: block.platform,
          }),
        })
      }
      setSaved(true)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <Section title="Guest info">
        <Field label="Guest name">
          <input type="text" value={form.guest_name} onChange={e => set('guest_name', e.target.value)} placeholder="e.g. Sarah Johnson" style={inputStyle} />
        </Field>
        <Field label="Email">
          <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="guest@email.com" style={inputStyle} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''))} placeholder="+1 416 000 0000" style={inputStyle} />
        </Field>
        <Field label="Guest notes">
          <textarea value={form.guest_notes} onChange={e => set('guest_notes', e.target.value)} rows={3} placeholder="Special requests, allergies, notes..." style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
        <Field label="Internal notes">
          <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal only" style={inputStyle} />
        </Field>
      </Section>

      <Section title="Check-in time">
        <Field label="Requested check-in time">
          <select value={form.early_checkin_time} onChange={e => set('early_checkin_time', e.target.value)}
            style={{ ...inputStyle, maxWidth: '200px', background: '#363634' }}>
            <option value="">Standard (4:00 PM)</option>
            {Array.from({ length: 24 }, (_, h) => ['00','30'].map(m => {
              const val = `${String(h).padStart(2,'0')}:${m}`
              const ampm = h >= 12 ? 'PM' : 'AM'
              const h12 = h % 12 || 12
              return <option key={val} value={val}>{h12}:{m} {ampm}</option>
            })).flat()}
          </select>
        </Field>
        <Field label="Status">
          <ApprovalButtons value={form.early_checkin_granted} onChange={v => set('early_checkin_granted', v)} />
        </Field>
        <div style={{ fontSize: '11px', color: '#666660' }}>Standard check-in: 4:00 PM. Leave blank if standard.</div>
      </Section>

      <Section title="Checkout time">
        <Field label="Requested checkout time">
          <select value={form.late_checkout_time} onChange={e => set('late_checkout_time', e.target.value)}
            style={{ ...inputStyle, maxWidth: '200px', background: '#363634' }}>
            <option value="">Standard (11:00 AM)</option>
            {Array.from({ length: 24 }, (_, h) => ['00','30'].map(m => {
              const val = `${String(h).padStart(2,'0')}:${m}`
              const ampm = h >= 12 ? 'PM' : 'AM'
              const h12 = h % 12 || 12
              return <option key={val} value={val}>{h12}:{m} {ampm}</option>
            })).flat()}
          </select>
        </Field>
        <Field label="Status">
          <ApprovalButtons value={form.late_checkout_granted} onChange={v => set('late_checkout_granted', v)} />
        </Field>
        <div style={{ fontSize: '11px', color: '#666660' }}>Standard checkout: 11:00 AM. Leave blank if standard.</div>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '12px 32px', background: saving ? '#363634' : 'var(--amber)', color: saving ? '#9A9A92' : '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>Saved</span>}
      </div>
    </div>
  )
}
