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

export default function SettingsForm({ icalUrls, settings }: { icalUrls: Record<string, string>;  settings: { referral_reward_amount: number } | null }) {
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
        <div style={{ fontSize: '13px', color: '#AEAEA6', lineHeight: 1.6 }}>
          Referral reward amounts are set per property under{' '}
          <a href="/admin/properties" style={{ color: 'var(--amber)', textDecoration: 'none' }}>Properties → Edit</a>.
          Referrer and new guest amounts can differ per property.
        </div>
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

      <Section title="iCal export — direct bookings">
        <div style={{ fontSize: '13px', color: '#AEAEA6', lineHeight: 1.6, marginBottom: '8px' }}>
          Subscribe to these URLs in Airbnb, VRBO and Houfy to automatically block direct booking dates.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: 'Royal York East', id: 'royal-york-east' },
            { label: 'Royal York West', id: 'royal-york-west' },
            { label: 'Nickel Beach', id: 'nickel-beach' },
          ].map(({ label, id }) => (
            <div key={id}>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>{label}</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <code style={{ flex: 1, padding: '8px 12px', background: '#1E1E1C', border: '0.5px solid #363634', color: '#AEAEA6', fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {icalUrls[id] ? icalUrls[id].replace(/token=.*/, 'token=***') : 'Set ICAL_SECRET in env'}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(icalUrls[id] || '')
                  }}
                  style={{ padding: '8px 14px', background: '#363634', color: '#AEAEA6', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Copy URL
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Integrations">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { label: 'Schlage Home API', status: 'Not connected', note: 'Required for automatic access code generation' },
            { label: 'Resend (email)', status: 'Not connected', note: 'Required for booking confirmations and reminders' },
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
