'use client'
import { useState, useRef, useEffect } from 'react'

const PROP_NAMES: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach Retreat' }

export default function GuestSupport() {
  const [verified, setVerified] = useState<any>(null)
  const [code, setCode] = useState('')
  const [lastName, setLastName] = useState('')
  const [verifyErr, setVerifyErr] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const [localTime, setLocalTime] = useState('')
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])
  useEffect(() => {
    const tick = () => setLocalTime(new Date().toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }))
    tick(); const t = setInterval(tick, 30000); return () => clearInterval(t)
  }, [])

  async function verify() {
    setVerifying(true); setVerifyErr('')
    try {
      const res = await fetch('/api/guest-support/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, lastName }) })
      const d = await res.json()
      if (d.error) { setVerifyErr(d.error); return }
      setVerified({ ...d.booking, code })
      if (d.history && d.history.length) {
        setMessages(d.history)
      } else {
        const nm = d.booking.guest_name ? ' ' + d.booking.guest_name.split(' ')[0] : ''
        setMessages([{ role: 'assistant', content: `Welcome,${nm}. I'm here to help you settle in and make the most of your stay — from check-in details to our favourite neighbourhood spots. What can I help you with?` }])
      }
    } finally { setVerifying(false) }
  }

  async function send() {
    const q = input.trim(); if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setBusy(true)
    try {
      const res = await fetch('/api/guest-support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: verified.code, booking_id: verified.booking_id, source: verified.source, messages: next.map(m => ({ role: m.role, content: m.content })) }) })
      const d = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: d.error ? `⚠️ ${d.error}` : d.answer }])
    } finally { setBusy(false) }
  }

  async function escalate() {
    const q = input.trim(); if (!q) return
    setBusy(true)
    await fetch('/api/guest-support/escalate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: verified.code, booking_id: verified.booking_id, source: verified.source, message: q }) })
    setMessages(m => [...m, { role: 'user', content: q }, { role: 'assistant', content: 'Of course — I have passed this along to your host, who will be in touch shortly. Is there anything else I can help you with in the meantime?' }])
    setInput(''); setEscalated(true); setBusy(false)
  }

  const wrap: React.CSSProperties = { minHeight: '100vh', background: '#F5F2EC', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px', fontFamily: 'var(--sans, system-ui)' }

  if (!verified) {
    return (
      <div style={wrap}>
        <div style={{ maxWidth: '380px', width: '100%', marginTop: '8vh' }}>
          <h1 style={{ fontFamily: 'var(--serif, Georgia)', fontWeight: 300, fontSize: '30px', color: '#1A1A18', marginBottom: '6px' }}>Guest Support</h1>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px', lineHeight: 1.5 }}>Enter your confirmation code and last name to access help with your stay.</p>
          <input placeholder="Confirmation code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} style={{ width: '100%', padding: '13px 15px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '10px', boxSizing: 'border-box', letterSpacing: '.05em' }} />
          <input placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') verify() }} style={{ width: '100%', padding: '13px 15px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '14px', boxSizing: 'border-box' }} />
          <button onClick={verify} disabled={verifying || !code || !lastName} style={{ width: '100%', padding: '14px', background: '#1A1A18', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>{verifying ? 'Checking…' : 'Access support'}</button>
          {verifyErr && <div style={{ color: '#c0392b', fontSize: '13px', marginTop: '12px' }}>{verifyErr}</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...wrap, padding: 0, background: '#fff' }}>
      <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--serif, Georgia)', fontSize: '18px', color: '#1A1A18' }}>Your stay at {PROP_NAMES[verified.property_id] || 'our home'}</div>
            <div style={{ fontSize: '12px', color: '#999' }}>{verified.check_in} → {verified.check_out}</div>
          </div>
          {localTime && <div style={{ fontSize: '12px', color: '#999', textAlign: 'right' }}>{localTime}<br /><span style={{ fontSize: '10px' }}>local time</span></div>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '11px 15px', borderRadius: '14px', fontSize: '15px', lineHeight: 1.5, background: m.role === 'user' ? '#1A1A18' : '#F0EDE6', color: m.role === 'user' ? '#fff' : '#1A1A18', whiteSpace: 'pre-wrap' }}>{m.content}</div>
          ))}
          {busy && <div style={{ alignSelf: 'flex-start', color: '#999', fontSize: '14px' }}>…</div>}
          <div ref={endRef} />
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #eee' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Ask about your stay…" style={{ flex: 1, padding: '12px 15px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '10px', outline: 'none' }} />
            <button onClick={send} disabled={busy || !input.trim()} style={{ padding: '12px 20px', background: '#1A1A18', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>Send</button>
          </div>
          <button onClick={escalate} disabled={busy || !input.trim()} style={{ marginTop: '8px', padding: '8px 14px', background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Send this to the host instead ↗</button>
        </div>
      </div>
    </div>
  )
}
