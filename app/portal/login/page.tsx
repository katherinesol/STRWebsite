'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export default function PortalLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/portal/auth/callback`,
        },
      })
      if (error) throw error
      setSent(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--linen)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--sans)', padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: 'var(--noir)', marginBottom: '8px' }}>
            Guest portal<span style={{ color: 'var(--amber)' }}>.</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Enter the email you used to book your stay.
          </div>
        </div>

        {sent ? (
          <div style={{ background: 'white', border: '0.5px solid var(--sand)', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: 'var(--noir)', marginBottom: '12px' }}>
              Check your email.
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>
              We sent a sign-in link to <strong style={{ color: 'var(--noir)' }}>{email}</strong>.
              Click the link to access your guest portal. The link expires in 1 hour.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: 'white', border: '0.5px solid var(--sand)', padding: '32px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '8px' }}>
                Email address
              </div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '0.5px solid var(--sand-mid)',
                  fontFamily: 'var(--sans)', fontSize: '14px',
                  color: 'var(--noir)', outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
              />
            </div>
            {error && <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '12px' }}>{error}</div>}
            <button
              type="submit"
              disabled={loading || !email}
              style={{
                width: '100%', padding: '13px',
                background: loading || !email ? 'var(--sand)' : 'var(--noir)',
                color: loading || !email ? 'var(--muted)' : 'var(--chalk)',
                border: 'none', fontFamily: 'var(--sans)',
                fontSize: '11px', letterSpacing: '.12em',
                textTransform: 'uppercase', cursor: loading || !email ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Sending...' : 'Send sign-in link'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <a href="/" style={{ fontSize: '12px', color: 'var(--muted)', textDecoration: 'none' }}>← Back to site</a>
        </div>
      </div>
    </div>
  )
}
