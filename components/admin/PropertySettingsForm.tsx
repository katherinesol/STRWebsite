'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Settings = {
  nightly_rate: number
  cleaning_fee: number
  earliest_checkin: string
  latest_checkout: string
  min_stay: number
  max_advance_days: number
  early_checkin_fee_per_hour: number
  late_checkout_fee_per_hour: number
  parking_spots: number
  bag_drop_available: boolean
  instacart_available: boolean
  security_deposit_amount: number
}

function FormField({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
      {children}
      {helper && <div style={{ fontSize: '11px', color: '#666660', marginTop: '4px' }}>{helper}</div>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '14px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
      <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: value ? 'var(--amber)' : '#4A4A48', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
        <div style={{ position: 'absolute', top: '2px', left: value ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
      </div>
      <span style={{ fontSize: '13px', color: '#F5F2EC' }}>{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
    </label>
  )
}

export default function PropertySettingsForm({ propertyId, settings }: { propertyId: string; settings: Settings | null }) {
  const router = useRouter()
  const [form, setForm] = useState<Settings>({
    nightly_rate: settings?.nightly_rate || 0,
    cleaning_fee: settings?.cleaning_fee || 0,
    earliest_checkin: settings?.earliest_checkin || '10:00',
    latest_checkout: settings?.latest_checkout || '14:00',
    min_stay: settings?.min_stay || 2,
    max_advance_days: settings?.max_advance_days || 365,
    early_checkin_fee_per_hour: settings?.early_checkin_fee_per_hour || 10,
    late_checkout_fee_per_hour: settings?.late_checkout_fee_per_hour || 10,
    parking_spots: settings?.parking_spots || 1,
    bag_drop_available: settings?.bag_drop_available || false,
    instacart_available: settings?.instacart_available || true,
    security_deposit_amount: settings?.security_deposit_amount || 500,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function set(key: keyof Settings, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/admin/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setSaved(true)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{children}</div>
    </div>
  )

  return (
    <div>
      <Section title="Pricing">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FormField label="Nightly rate ($)">
            <input type="number" value={form.nightly_rate} onChange={e => set('nightly_rate', parseFloat(e.target.value))} style={inputStyle} />
          </FormField>
          <FormField label="Cleaning fee ($)">
            <input type="number" value={form.cleaning_fee} onChange={e => set('cleaning_fee', parseFloat(e.target.value))} style={inputStyle} />
          </FormField>
          <FormField label="Security deposit ($)">
            <input type="number" value={form.security_deposit_amount} onChange={e => set('security_deposit_amount', parseFloat(e.target.value))} style={inputStyle} />
          </FormField>
          <FormField label="Min stay (nights)">
            <input type="number" value={form.min_stay} onChange={e => set('min_stay', parseInt(e.target.value))} style={inputStyle} />
          </FormField>
          <FormField label="Max advance booking (days)" helper="How far ahead guests can book">
            <input type="number" value={form.max_advance_days} onChange={e => set('max_advance_days', parseInt(e.target.value))} style={inputStyle} />
          </FormField>
        </div>
      </Section>

      <Section title="Check-in & checkout">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FormField label="Earliest check-in" helper="Earliest time guests can request">
            <input type="time" value={form.earliest_checkin} onChange={e => set('earliest_checkin', e.target.value)} style={inputStyle} />
          </FormField>
          <FormField label="Latest checkout" helper="Latest time guests can request">
            <input type="time" value={form.latest_checkout} onChange={e => set('latest_checkout', e.target.value)} style={inputStyle} />
          </FormField>
          <FormField label="Early check-in fee ($/hour)">
            <input type="number" value={form.early_checkin_fee_per_hour} onChange={e => set('early_checkin_fee_per_hour', parseFloat(e.target.value))} style={inputStyle} />
          </FormField>
          <FormField label="Late checkout fee ($/hour)">
            <input type="number" value={form.late_checkout_fee_per_hour} onChange={e => set('late_checkout_fee_per_hour', parseFloat(e.target.value))} style={inputStyle} />
          </FormField>
        </div>
      </Section>

      <Section title="Amenities & options">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FormField label="Parking spots">
            <input type="number" value={form.parking_spots} onChange={e => set('parking_spots', parseInt(e.target.value))} style={inputStyle} />
          </FormField>
        </div>
        <Toggle value={form.bag_drop_available} onChange={v => set('bag_drop_available', v)} label="Bag drop available" />
        <Toggle value={form.instacart_available} onChange={v => set('instacart_available', v)} label="Instacart delivery available" />
      </Section>

      {/* save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 32px', background: saving ? '#363634' : 'var(--amber)',
            color: saving ? '#9A9A92' : '#1A1A18', border: 'none',
            fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em',
            textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
