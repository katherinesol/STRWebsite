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

export default function GuestForm({ guest }: { guest: Guest }) {
  const router = useRouter()
  const [form, setForm] = useState({
    id_verified: guest.id_verified,
    returning_guest: guest.returning_guest,
    locked_rate_enabled: guest.locked_rate_enabled,
    locked_rate_royal_york: guest.locked_rate_royal_york || '',
    locked_rate_nickel_beach: guest.locked_rate_nickel_beach || '',
    notes: guest.notes || '',
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

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>
        Guest settings
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
        <Toggle value={form.id_verified} onChange={v => set('id_verified', v)} label="ID verified" />
        <Toggle value={form.returning_guest} onChange={v => set('returning_guest', v)} label="Mark as returning guest" />

        {/* locked rate */}
        <div style={{ borderTop: '0.5px solid #363634', paddingTop: '16px' }}>
          <Toggle value={form.locked_rate_enabled} onChange={v => set('locked_rate_enabled', v)} label="Honour locked rate" />
          {form.locked_rate_enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>
                  Royal York rate ($/night)
                </div>
                <input
                  type="number"
                  value={form.locked_rate_royal_york}
                  onChange={e => set('locked_rate_royal_york', e.target.value)}
                  placeholder="e.g. 180"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>
                  Nickel Beach rate ($/night)
                </div>
                <input
                  type="number"
                  value={form.locked_rate_nickel_beach}
                  onChange={e => set('locked_rate_nickel_beach', e.target.value)}
                  placeholder="e.g. 320"
                  style={inputStyle}
                />
              </div>
            </div>
          )}
        </div>

        {/* notes */}
        <div style={{ borderTop: '0.5px solid #363634', paddingTop: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>
            Internal notes
          </div>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Private notes — not visible to guest"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {/* referral code */}
        <div style={{ borderTop: '0.5px solid #363634', paddingTop: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>
            Referral code
          </div>
          <div style={{ fontSize: '14px', color: 'var(--amber)', letterSpacing: '.1em', fontFamily: 'monospace' }}>
            {guest.referral_code}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 24px', background: saving ? '#363634' : 'var(--amber)',
            color: saving ? '#9A9A92' : '#1A1A18', border: 'none',
            fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em',
            textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
