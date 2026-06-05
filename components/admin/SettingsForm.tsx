'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '14px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{children}</div>
    </div>
  )
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: '360px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
      {children}
      {helper && <div style={{ fontSize: '11px', color: '#666660', marginTop: '4px' }}>{helper}</div>}
    </div>
  )
}

export default function SettingsForm({ settings }: { settings: { referral_reward_amount: number } | null }) {
  const router = useRouter()
  const [referralAmount, setReferralAmount] = useState(settings?.referral_reward_amount || 50)
  const [etransferEmail, setEtransferEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_reward_amount: referralAmount }),
      })
      setSaved(true)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <div>
      <Section title="Referrals">
        <Field label="Referral reward amount ($)" helper="Amount both parties receive — referrer and new guest">
          <input type="number" value={referralAmount} onChange={e => { setReferralAmount(parseFloat(e.target.value)); setSaved(false) }} style={inputStyle} />
        </Field>
      </Section>

      <Section title="Payments">
        <Field label="E-transfer email" helper="The email address you send guests for e-transfer deposits">
          <input type="email" value={etransferEmail} onChange={e => setEtransferEmail(e.target.value)} placeholder="payments@yourdomain.com" style={inputStyle} />
        </Field>
        <div style={{ background: '#363634', border: '0.5px solid #4A4A48', padding: '16px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Stripe</div>
          <div style={{ fontSize: '13px', color: '#AEAEA6' }}>Stripe integration — coming soon. Card payments will be enabled once connected.</div>
        </div>
      </Section>

      <Section title="Integrations">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { label: 'Schlage Home API', status: 'Not connected', note: 'Required for automatic access code generation' },
            { label: 'Resend (email)', status: 'Not connected', note: 'Required for booking confirmations and reminders' },
            { label: 'Airbnb iCal', status: 'Connected', note: 'Nickel Beach synced' },
            { label: 'VRBO iCal', status: 'Connected', note: 'Nickel Beach synced' },
            { label: 'Houfy iCal', status: 'Connected', note: 'Nickel Beach synced' },
          ].map(({ label, status, note }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#1E1E1C', border: '0.5px solid #363634' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{label}</div>
                <div style={{ fontSize: '11px', color: '#666660', marginTop: '2px' }}>{note}</div>
              </div>
              <span style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: status === 'Connected' ? '#2ecc71' : '#f39c12' }}>
                {status}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Account">
        <Field label="Admin password" helper="Change your admin login password">
          <input type="password" placeholder="New password" style={inputStyle} />
        </Field>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={handleSave} disabled={saving}
          style={{
            padding: '12px 32px', background: saving ? '#363634' : 'var(--amber)',
            color: saving ? '#9A9A92' : '#1A1A18', border: 'none',
            fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em',
            textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500,
          }}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
        {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
