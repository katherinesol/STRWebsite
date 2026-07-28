'use client'
import { useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mfa, setMfa] = useState(false)
  const [code, setCode] = useState('')
  const router = useRouter()

  async function loginWithPasskey() {
    setError(''); setLoading(true)
    try {
      const options = await fetch(`/api/admin/passkey/auth?email=${encodeURIComponent(username)}`).then(r => r.json())
      if (options.error) { setError(options.error === 'No passkeys' ? 'No passkey on this account' : options.error); setLoading(false); return }
      const assertion = await startAuthentication({ optionsJSON: options })
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password, passkeyAssertion: assertion }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.mfaRequired) router.push('/admin')
      else setError(data.error || 'Passkey sign-in failed')
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Cancelled' : 'Passkey sign-in failed')
    } finally { setLoading(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password, token: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.mfaRequired) {
        router.push('/admin')
      } else if (data.mfaRequired) {
        setMfa(true)
        setError(code ? 'That code is not valid' : '')
      } else {
        setError('Invalid username or password')
      }
    } catch {
      setError('Something went wrong — try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--noir)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--sans)',
    }}>
      <div style={{ width: '100%', maxWidth: '380px', padding: '0 24px' }}>
        <div style={{
          fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300,
          fontStyle: 'italic', color: '#F0EDE6', marginBottom: '8px',
          textAlign: 'center',
        }}>
          Admin<span style={{ color: 'var(--amber)' }}>.</span>
        </div>
        <div style={{
          fontSize: '10px', letterSpacing: '.16em', textTransform: 'uppercase',
          color: '#9A9A92', textAlign: 'center', marginBottom: '40px',
        }}>
          Host dashboard
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { label: 'Username', value: username, setter: setUsername, type: 'text' },
            { label: 'Password', value: password, setter: setPassword, type: 'password' },
          ].map(({ label, value, setter, type }) => (
            <div key={label}>
              <div style={{
                fontSize: '10px', fontWeight: 500, letterSpacing: '.14em',
                textTransform: 'uppercase', color: '#AEAEA6', marginBottom: '6px',
              }}>
                {label}
              </div>
              <input
                type={type}
                value={value}
                onChange={e => setter(e.target.value)}
                required
                style={{
                  width: '100%', padding: '12px 14px',
                  background: '#363634', border: '0.5px solid #4A4A48',
                  color: '#F0EDE6', fontFamily: 'var(--sans)', fontSize: '14px',
                  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
          {mfa && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#AEAEA6', marginBottom: '6px' }}>Authenticator code</div>
              <input type="text" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} autoFocus placeholder="6-digit code or backup code"
                style={{ width: '100%', padding: '12px 14px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontFamily: 'var(--sans)', fontSize: '14px', outline: 'none', borderRadius: '2px', boxSizing: 'border-box' }} />
              <button type="button" onClick={loginWithPasskey} disabled={loading}
                style={{ width: '100%', marginTop: '10px', padding: '11px', background: '#363634', color: '#F0EDE6', border: '0.5px solid #4A4A48', fontSize: '12px', letterSpacing: '.06em', cursor: 'pointer', borderRadius: '2px' }}>
                Use a passkey instead
              </button>
            </div>
          )}
          {error && (
            <div style={{ fontSize: '12px', color: '#e74c3c', textAlign: 'center' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              background: loading ? '#4A4A48' : 'var(--amber)',
              color: loading ? '#AEAEA6' : '#242422',
              border: 'none', fontFamily: 'var(--sans)',
              fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              borderRadius: '2px', marginTop: '8px', fontWeight: 500,
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
