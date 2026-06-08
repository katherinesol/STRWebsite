'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Guest = {
  id: string
  name: string
  email: string
  phone: string | null
  id_verified: boolean
  returning_guest: boolean
  locked_rate_enabled: boolean
  locked_rate_royal_york: number | null
  locked_rate_nickel_beach: number | null
  referral_code: string
  notes: string | null
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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>{label}</div>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '0.5px solid #363634', paddingTop: '20px', marginTop: '4px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '14px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </div>
  )
}

export default function GuestForm({ guest }: { guest: Guest }) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: guest.name || '',
    email: guest.email || '',
    phone: guest.phone || '',
    id_verified: guest.id_verified,
    returning_guest: guest.returning_guest,
    locked_rate_enabled: guest.locked_rate_enabled,
    locked_rate_royal_york: guest.locked_rate_royal_york || '',
    locked_rate_nickel_beach: guest.locked_rate_nickel_beach || '',
    notes: guest.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/admin/guests/${guest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setSaved(true)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${guest.name}? This cannot be undone. All booking history will be preserved but unlinked.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/admin/guests/${guest.id}`, { method: 'DELETE' })
      router.push('/admin/guests')
    } catch {}
    finally { setDeleting(false) }
  }

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>
        Guest info
      </div>

      {/* contact info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Field label="Full name">
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value.replace(/[^\d+\-\s()]/g, ''))} style={inputStyle} />
        </Field>
      </div>

      {/* flags */}
      <Section title="Flags">
        <Toggle value={form.id_verified} onChange={v => set('id_verified', v)} label="ID verified" />
        <Toggle value={form.returning_guest} onChange={v => set('returning_guest', v)} label="Returning guest" />
      </Section>

      {/* locked rate */}
      <Section title="Locked rate">
        <Toggle value={form.locked_rate_enabled} onChange={v => set('locked_rate_enabled', v)} label="Honour locked rate" />
        {form.locked_rate_enabled && (
          <>
            <Field label="Royal York rate ($/night)">
              <input type="number" value={form.locked_rate_royal_york} onChange={e => set('locked_rate_royal_york', e.target.value)} placeholder="e.g. 180" style={inputStyle} />
            </Field>
            <Field label="Nickel Beach rate ($/night)">
              <input type="number" value={form.locked_rate_nickel_beach} onChange={e => set('locked_rate_nickel_beach', e.target.value)} placeholder="e.g. 320" style={inputStyle} />
            </Field>
          </>
        )}
      </Section>

      {/* notes */}
      <Section title="Internal notes">
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
          placeholder="Private notes — not visible to guest"
          style={{ ...inputStyle, resize: 'vertical' }} />
      </Section>

      {/* referral code */}
      <Section title="Referral code">
        <div style={{ fontSize: '14px', color: 'var(--amber)', letterSpacing: '.1em', fontFamily: 'monospace' }}>
          {guest.referral_code || '—'}
        </div>
      </Section>

      {/* actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '24px', paddingTop: '20px', borderTop: '0.5px solid #363634' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '10px 24px', background: saving ? '#363634' : 'var(--amber)', color: saving ? '#9A9A92' : '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓ Saved</span>}
        </div>
        <button onClick={handleDelete} disabled={deleting}
          style={{ padding: '10px 20px', background: 'transparent', border: '0.5px solid #3a1a1a', color: '#e74c3c', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {deleting ? 'Deleting...' : 'Delete guest'}
        </button>
      </div>
    </div>
  )
}
