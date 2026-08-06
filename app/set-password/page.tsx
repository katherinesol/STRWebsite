'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export default function SetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    // the invite link puts a session in the URL hash; Supabase picks it up
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setReady(true); setEmail(data.session.user.email || '') }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) { setReady(true); setEmail(session.user.email || '') }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function submit(e: any) {
    e.preventDefault()
    setErr('')
    if (pw.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (pw !== pw2) { setErr('Passwords do not match'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setSaving(false)
    if (error) { setErr(error.message); return }
    router.push('/admin')
  }

  const inp: React.CSSProperties = { width: '100%', padding: '11px 12px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '14px', borderRadius: '6px', marginTop: '4px' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1A1A18', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '380px', background: '#242422', border: '0.5px solid #363634', borderRadius: '12px', padding: '32px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '26px', color: '#F0EDE6', margin: '0 0 6px' }}>Set your password</h1>
        {!ready ? (
          <p style={{ fontSize: '13px', color: '#9A9A92' }}>Verifying your invite link…</p>
        ) : (
          <form onSubmit={submit}>
            <p style={{ fontSize: '13px', color: '#9A9A92', marginBottom: '18px' }}>Welcome{email ? `, ${email}` : ''}. Choose a password to finish setting up your account.</p>
            <label style={{ fontSize: '12px', color: '#9A9A92' }}>New password<input type="password" value={pw} onChange={e => setPw(e.target.value)} style={inp} autoFocus /></label>
            <label style={{ fontSize: '12px', color: '#9A9A92', display: 'block', marginTop: '14px' }}>Confirm password<input type="password" value={pw2} onChange={e => setPw2(e.target.value)} style={inp} /></label>
            {err && <div style={{ fontSize: '12px', color: '#e57373', marginTop: '12px' }}>{err}</div>}
            <button type="submit" disabled={saving} style={{ width: '100%', marginTop: '20px', padding: '12px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>{saving ? 'Saving…' : 'Set password & sign in'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
