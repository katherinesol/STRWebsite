'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

/*  WHAT A GUEST IS TOLD WHEN THE LINK CANNOT BE SENT.
 *
 *  This screen rendered `err.message || 'Something went wrong'`, which put
 *  whatever the auth service said in front of a guest — and when the send failed
 *  the message was unparseable, so somebody trying to reach their own booking
 *  was shown "{}" and left to guess. An error a guest cannot act on is worse
 *  than no error: it reads as a broken site rather than a temporary one.
 *
 *  Nothing from the error object is ever rendered. The cause is matched and a
 *  sentence chosen; anything unrecognised falls through to the same honest
 *  default, and the detail goes to the console for whoever is debugging.
 *
 *  THE CURRENT FAILURE IS NOT THE GUEST'S FAULT AND NOT A CODE FAULT. Supabase
 *  returns 500 "Error sending confirmation email" because outbound mail is not
 *  configured on the project yet — it waits on the domain. Until then this
 *  screen says so in a way a guest can act on, which is the most it can do. */
function signInMessage(err: any): string {
  const code = String(err?.code ?? err?.error_code ?? '')
  const raw = String(err?.message ?? '')
  const status = Number(err?.status ?? 0)

  //  the detail is for us, not for the guest
  try { console.error('[portal-login] sign-in failed:', code || status || raw) } catch {}

  if (/invalid|malformed/i.test(raw) && /email/i.test(raw)) {
    return 'That does not look like a complete email address. Please check it and try again.'
  }
  if (status === 429 || /rate|too many/i.test(raw + code)) {
    return 'Too many attempts just now. Please wait a few minutes and try again.'
  }
  //  otp_disabled, 500 mailer failures, anything else
  return "We couldn't send the sign-in link right now. Please try again shortly, or contact your host directly."
}

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
      setError(signInMessage(err))
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
