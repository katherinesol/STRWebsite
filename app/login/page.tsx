'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.href = '/admin'
      } else {
        setError('Invalid email or password')
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
            { label: 'Email', value: email, setter: setEmail, type: 'email' },
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
