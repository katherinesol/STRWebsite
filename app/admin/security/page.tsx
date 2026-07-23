'use client'
import { useState, useEffect } from 'react'

export default function SecurityPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [token, setToken] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyCodes(list: string[]) {
    const text = list.join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function load() { fetch('/api/admin/2fa').then(r => r.json()).then(d => setEnabled(!!d.enabled)) }
  useEffect(() => { load() }, [])

  async function start() {
    setBusy(true); setErr(''); setCodes([])
    const d = await fetch('/api/admin/2fa', { method: 'POST' }).then(r => r.json())
    setBusy(false)
    if (d.error) { setErr(d.error); return }
    setQr(d.qr); setSecret(d.secret)
  }
  async function confirm() {
    setBusy(true); setErr('')
    const d = await fetch('/api/admin/2fa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).then(r => r.json())
    setBusy(false)
    if (d.error) { setErr(d.error); return }
    setCodes(d.backupCodes || []); setQr(''); setToken(''); load()
  }
  async function disable() {
    if (!window.confirm('Turn off two-factor authentication?')) return
    await fetch('/api/admin/2fa', { method: 'DELETE' })
    setQr(''); setCodes([]); load()
  }

  const card: React.CSSProperties = { background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', padding: '22px', maxWidth: '460px' }
  const btn: React.CSSProperties = { padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: '0 0 4px' }}>Security</h1>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '22px' }}>Two-factor authentication for your admin login.</p>

      <div style={card}>
        {enabled === null && <div style={{ fontSize: '13px', color: '#666660' }}>Loading…</div>}

        {enabled === true && !codes.length && (
          <>
            <div style={{ fontSize: '13px', color: '#7bc47b', marginBottom: '6px' }}>Two-factor authentication is on</div>
            <p style={{ fontSize: '12px', color: '#9A9A92', lineHeight: 1.6, marginBottom: '16px' }}>You&apos;ll be asked for a code from your authenticator app when you log in.</p>
            <button onClick={disable} style={{ ...btn, background: '#363634', color: '#c47b7b' }}>Turn off</button>
          </>
        )}

        {enabled === false && !qr && (
          <>
            <div style={{ fontSize: '13px', color: '#F0EDE6', marginBottom: '6px' }}>Not set up</div>
            <p style={{ fontSize: '12px', color: '#9A9A92', lineHeight: 1.6, marginBottom: '16px' }}>You&apos;ll scan a QR code with an authenticator app — Google Authenticator, Authy, or 1Password all work.</p>
            <button onClick={start} disabled={busy} style={btn}>{busy ? 'Setting up…' : 'Set up two-factor'}</button>
          </>
        )}

        {qr && (
          <>
            <div style={{ fontSize: '13px', color: '#F0EDE6', marginBottom: '10px' }}>1. Scan this with your authenticator app</div>
            <img src={qr} alt="QR code" style={{ width: '190px', borderRadius: '6px', marginBottom: '10px' }} />
            <div style={{ fontSize: '10px', color: '#666660', marginBottom: '18px', wordBreak: 'break-all' }}>Can&apos;t scan? Enter this key manually: <span style={{ fontFamily: 'monospace', color: '#9A9A92' }}>{secret}</span></div>
            <div style={{ fontSize: '13px', color: '#F0EDE6', marginBottom: '8px' }}>2. Enter the 6-digit code it shows</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={token} onChange={e => setToken(e.target.value)} placeholder="000000" maxLength={6}
                style={{ width: '120px', padding: '10px 12px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '15px', letterSpacing: '.2em', fontFamily: 'monospace', borderRadius: '6px' }} />
              <button onClick={confirm} disabled={busy || token.length < 6} style={btn}>Confirm</button>
            </div>
          </>
        )}

        {codes.length > 0 && (
          <>
            <div style={{ fontSize: '13px', color: '#7bc47b', marginBottom: '6px' }}>Two-factor is on. Save these backup codes.</div>
            <p style={{ fontSize: '12px', color: '#9A9A92', lineHeight: 1.6, marginBottom: '14px' }}>Each works once, if you lose access to your phone. Store them somewhere safe — you won&apos;t see them again.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginBottom: '14px' }}>
              {codes.map(c => <span key={c} style={{ fontFamily: 'monospace', fontSize: '13px', color: '#F0EDE6', background: '#1E1E1C', padding: '7px 10px', borderRadius: '4px', textAlign: 'center' }}>{c}</span>)}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => copyCodes(codes)} style={{ ...btn, background: '#363634', color: '#F0EDE6' }}>{copied ? 'Copied' : 'Copy codes'}</button>
              <button onClick={() => setCodes([])} style={btn}>I&apos;ve saved them</button>
            </div>
          </>
        )}

        {err && <div style={{ fontSize: '12px', color: '#c47b7b', marginTop: '12px' }}>{err}</div>}
      </div>
    </div>
  )
}
